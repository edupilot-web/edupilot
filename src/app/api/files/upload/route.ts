import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";
import { buildStorageKey, storageDriver, UPLOAD_POLICY, validateUpload } from "@/lib/storage";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { StudentProfile } from "@/models/StudentProfile";
import { StoredFile, type FilePurpose } from "@/models/StoredFile";

/**
 * POST /api/files/upload  (§22, §67, §86)
 *
 * Multipart, one or more files, one `purpose`. Returns the catalogue rows the
 * client then attaches to an assignment, a note or a submission.
 *
 * Uploading is deliberately separate from saving the thing the file belongs to.
 * A teacher drags a PDF onto a form they have not submitted yet, so at the
 * moment the bytes arrive there is nothing to attach them to — which is why
 * `StoredFile` is a collection rather than a subdocument, and why rows with no
 * `attachedToId` are a normal intermediate state rather than corruption.
 *
 * **The college comes from the uploader's own profile.** It is written onto the
 * row and is the first thing the download route checks, so a file can never
 * cross a college boundary even if every later check were somehow bypassed.
 */

export const maxDuration = 60;

/**
 * Per-user, per-hour.
 *
 * Uploads are the most expensive unauthenticated-by-content thing in the
 * module: each one consumes disk and none of it is reclaimed until an orphan
 * sweep runs. Forty an hour is far above a real lecture's worth of material.
 */
const UPLOAD_LIMIT = { limit: 40, windowSeconds: 60 * 60 };

/** Belt and braces on top of the per-file cap: the whole request is bounded. */
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    const allowance = await consumeRateLimits([
      { key: `file-upload:${session.sub}`, rule: UPLOAD_LIMIT },
    ]);

    if (!allowance.allowed) {
      return fail(
        `Too many uploads. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429
      );
    }

    const driver = storageDriver();
    if (!driver.isConfigured()) {
      /**
       * Said plainly rather than swallowed.
       *
       * A deployment that set `STORAGE_DRIVER` to something unimplemented needs
       * to find out on the first upload, not after a term of silently-lost
       * attachments.
       */
      return fail(
        "File uploads are not available on this deployment. Ask an administrator to configure storage.",
        503,
        { code: "storage-unavailable" }
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("Send the files as multipart form data.", 400);
    }

    const purpose = String(form.get("purpose") ?? "") as FilePurpose;
    const policy = UPLOAD_POLICY[purpose];
    if (!policy) return fail("Unknown upload type.", 422, { field: "purpose" });

    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!files.length) return fail("Choose at least one file.", 422, { field: "files" });
    if (files.length > policy.maxFiles) {
      return fail(`Attach at most ${policy.maxFiles} files.`, 422, { field: "files" });
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_REQUEST_BYTES) {
      return fail("That is too much to upload at once. Send fewer files.", 413);
    }

    // ── Who is uploading, and which college they belong to ────────────────
    const context = await resolveUploader(session.sub, purpose);
    if (!context) {
      return fail("You cannot upload this kind of file.", 403, { code: "wrong-role" });
    }

    await connectDB();

    const stored: {
      fileId: string;
      fileName: string;
      mimeType: string;
      size: number;
    }[] = [];
    const rejected: { fileName: string; reason: string }[] = [];

    for (const file of files) {
      const refusal = validateUpload({
        purpose,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      });

      if (refusal) {
        // Reported per file rather than failing the request, so one bad file
        // among five does not make the teacher re-pick the other four.
        rejected.push({ fileName: file.name, reason: refusal.message });
        continue;
      }

      const key = buildStorageKey({
        purpose,
        collegeId: context.collegeId,
        fileName: file.name,
      });

      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await driver.put(key, bytes, file.type);

      const row = await StoredFile.create({
        purpose,
        uploadedBy: session.sub,
        uploaderRole: context.role,
        collegeId: context.collegeId,
        fileName: file.name.slice(0, 260),
        mimeType: file.type,
        size: result.size,
        storageKey: result.storageKey,
        driver: driver.name,
        checksum: result.checksum,
        /**
         * `skipped`, not `clean` (§86).
         *
         * No scanner is wired up, and recording that nothing checked is honest
         * where claiming a clean scan would not be.
         */
        scanStatus: "skipped",
      });

      stored.push({
        fileId: String(row._id),
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
      });
    }

    if (!stored.length) {
      return fail(rejected[0]?.reason ?? "None of those files could be uploaded.", 422, {
        details: { rejected },
      });
    }

    return ok({ files: stored, rejected }, 201);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * The uploader's role and college.
 *
 * A teacher may upload assignment and note attachments; a student may upload a
 * submission. Neither may upload the other's kind — a student uploading a
 * `note_attachment` would be creating a file whose download rule says "every
 * student the note reached may read this".
 */
async function resolveUploader(
  userId: string,
  purpose: FilePurpose
): Promise<{ role: "teacher" | "student"; collegeId: string } | null> {
  if (purpose === "submission_attachment") {
    await connectDB();
    const profile = await StudentProfile.findOne({ userId }).select("collegeId").lean();
    if (!profile?.collegeId) return null;
    return { role: "student", collegeId: String(profile.collegeId) };
  }

  const teacher = await getCurrentTeacher();
  if (!teacher) return null;

  // Uploading is part of preparing content to publish, so it needs the same
  // standing as publishing it.
  if (!teacher.canPublish) return null;

  return { role: "teacher", collegeId: teacher.collegeId };
}
