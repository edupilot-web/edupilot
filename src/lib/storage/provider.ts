import { createHash, randomUUID } from "node:crypto";
import type { FilePurpose } from "@/models/StoredFile";

/**
 * The storage seam (§22, §67).
 *
 * Nothing in the module writes bytes. A route hands a `File` to
 * `storeUpload()`, gets a `storageKey` back and writes a catalogue row; a
 * download route resolves that key through the same interface. Which driver is
 * behind it — the local disk, S3, R2, a shared volume — is an environment
 * variable.
 *
 * That seam is not architecture for its own sake: the platform has **no object
 * storage configured today**, and a module that assumed one would be
 * unbuildable, while one that wrote into MongoDB would violate §22 and be
 * painful to unpick later. The local driver works now; the S3 driver is the
 * same interface and a key change.
 *
 * **There are no public URLs.** §67 asks for signed URLs so that permanent
 * credentials are never exposed and permission is checked before access. This
 * goes one step further and never issues a bytes-bearing URL at all: every
 * download goes through `/api/files/[fileId]`, which re-checks that *this*
 * user may read *this* file and only then asks the driver for a stream. A
 * signed URL is a bearer token — forwardable, and valid until it expires, to
 * whoever holds it — and for a student's submission that is a worse guarantee
 * than a session check on every request.
 */

export type PutResult = {
  storageKey: string;
  size: number;
  checksum: string;
};

export interface StorageDriver {
  readonly name: string;
  isConfigured(): boolean;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

// ── Upload policy (§86) ───────────────────────────────────────────────────

/**
 * What each kind of upload may be.
 *
 * Per purpose, not global: a student handing in a submission has no business
 * uploading a 50MB slide deck, and a teacher sharing lecture slides needs more
 * room than a student's PDF answer. Separate caps mean the generous one does
 * not have to cover both.
 */
export const UPLOAD_POLICY: Record<
  FilePurpose,
  { maxBytes: number; mimeTypes: readonly string[]; maxFiles: number }
> = {
  assignment_attachment: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: documentMimes(),
    maxFiles: 10,
  },
  note_attachment: {
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: documentMimes(),
    maxFiles: 10,
  },
  submission_attachment: {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: [...documentMimes(), "text/x-python", "text/x-java-source", "application/x-zip-compressed"],
    maxFiles: 5,
  },
  /**
   * Evidence for a request — a photo of the broken fitting, a scan of the old
   * certificate. Images matter more here than anywhere else in the product,
   * which is why the cap is small: a phone photo is a couple of megabytes and
   * nothing a help desk needs is larger.
   */
  service_request_attachment: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: documentMimes(),
    maxFiles: 5,
  },
  /** The issued document. Generous, because a scanned transcript is heavy. */
  service_request_resolution: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: documentMimes(),
    maxFiles: 5,
  },
};

function documentMimes(): string[] {
  return [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/zip",
  ];
}

/**
 * Extensions refused whatever the declared MIME type says.
 *
 * A denylist *on top of* the MIME allowlist, not instead of it. The allowlist
 * is the real control; this catches the case the allowlist cannot, which is a
 * browser or a crafted request declaring `application/pdf` for `payload.exe`.
 * §86 asks for extension, MIME and size to be validated, and these are the
 * three checks.
 */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "bat", "cmd", "com", "msi", "scr", "pif", "cpl", "jar",
  "sh", "bash", "ps1", "vbs", "js", "jse", "wsf", "hta", "reg", "app",
  "html", "htm", "svg", "xhtml",
]);

export type UploadRefusal = { code: string; message: string };

/**
 * Check a file before a single byte is stored.
 *
 * Returns a refusal rather than throwing, so a multi-file upload can report
 * which file was rejected and why instead of failing as a whole.
 */
export function validateUpload(input: {
  purpose: FilePurpose;
  fileName: string;
  mimeType: string;
  size: number;
}): UploadRefusal | null {
  const policy = UPLOAD_POLICY[input.purpose];
  if (!policy) return { code: "unknown-purpose", message: "Unknown upload type." };

  if (input.size <= 0) {
    return { code: "empty-file", message: `${input.fileName} is empty.` };
  }
  if (input.size > policy.maxBytes) {
    return {
      code: "too-large",
      message: `${input.fileName} is larger than ${Math.round(policy.maxBytes / 1024 / 1024)}MB.`,
    };
  }

  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return {
      code: "blocked-extension",
      message: `${input.fileName} is a file type we cannot accept.`,
    };
  }

  /**
   * An unknown MIME type is refused, not accepted with a shrug.
   *
   * A browser that cannot identify a file sends `application/octet-stream`,
   * and that is precisely the header an executable arrives under. Refusing it
   * costs a teacher one re-save as a PDF; accepting it costs the platform a
   * malware distribution channel.
   */
  if (!policy.mimeTypes.includes(input.mimeType)) {
    return {
      code: "unsupported-type",
      message: `${input.fileName} is not a supported file type.`,
    };
  }

  return null;
}

/**
 * Where a file lives, as a key.
 *
 * `purpose/collegeId/yyyy-mm/uuid.ext`. The college is in the path so a
 * misconfigured bucket policy fails closed per college rather than platform
 * wide, the month makes a lifecycle rule expressible, and the name is a UUID
 * rather than the uploaded filename — which would otherwise let a teacher
 * called their file `../../../etc/passwd` and let two teachers overwrite each
 * other's `notes.pdf`.
 */
export function buildStorageKey(input: {
  purpose: FilePurpose;
  collegeId: string;
  fileName: string;
}): string {
  const extension = safeExtension(input.fileName);
  const month = new Date().toISOString().slice(0, 7);
  return `${input.purpose}/${input.collegeId}/${month}/${randomUUID()}${extension}`;
}

function safeExtension(fileName: string): string {
  const raw = fileName.split(".").pop()?.toLowerCase() ?? "";
  // Letters and digits only, capped: everything else is either a traversal
  // attempt or a name no filesystem wants.
  const cleaned = raw.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return cleaned ? `.${cleaned}` : "";
}

/**
 * The name shown to a downloader.
 *
 * Sanitised on the way *out* as well as on the way in, because the stored name
 * ends up in a `Content-Disposition` header — where a newline or a quote is a
 * header injection rather than a cosmetic problem.
 */
export function safeDownloadName(fileName: string): string {
  return (
    fileName
      .replace(/[\r\n"\\]/g, "")
      .replace(/[^\w.\- ()[\]]/g, "_")
      .slice(0, 180) || "download"
  );
}

export function checksumOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
