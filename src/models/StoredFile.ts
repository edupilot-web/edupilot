import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * Uploaded files: the catalogue row, never the bytes.
 *
 * §22 forbids putting large files in MongoDB, and this collection is how that
 * is kept true — every document here is metadata plus a `storageKey`, and the
 * bytes live wherever the configured storage driver put them. A deployment
 * moving from local disk to S3 changes the driver and rewrites `storageKey`;
 * nothing that *reads* a file changes at all.
 *
 * **Its own collection rather than a subdocument**, even though every file
 * belongs to exactly one assignment, note or submission. Three reasons, and the
 * first is the one that matters: a file is uploaded *before* the thing it will
 * be attached to exists — a teacher drags a PDF onto a form they have not
 * submitted yet — so there is nothing to embed it in at the moment it is
 * created. It also gives the download route one stable id to authorise against,
 * and it makes an orphan sweep possible: rows with `attachedTo: null` older
 * than a day are abandoned uploads.
 *
 * The item the file ends up on keeps a *denormalised* copy of the display
 * fields, so rendering a list of attachments needs no join. This row stays the
 * authority for the key, the size and the access check.
 */

/** What the file is for. Decides who may read it, and which limits apply. */
export const FILE_PURPOSES = [
  "assignment_attachment",
  "note_attachment",
  "submission_attachment",
  /** What a student attaches to a support request — usually a screenshot. */
  "service_request_attachment",
  /** What support sends back — a corrected export, a receipt, a screenshot. */
  "service_request_resolution",
] as const;

export type FilePurpose = (typeof FILE_PURPOSES)[number];

export const FILE_SCAN_STATUSES = ["pending", "clean", "infected", "skipped"] as const;
export type FileScanStatus = (typeof FILE_SCAN_STATUSES)[number];

const storedFileSchema = new Schema(
  {
    purpose: { type: String, enum: FILE_PURPOSES, required: true, index: true },

    /**
     * Who uploaded it — a `User`, teacher or student alike.
     *
     * The uploader is not necessarily who may read it: a teacher's assignment
     * attachment is readable by every student it was published to, and a
     * student's submission is readable by the teacher who set the work. That
     * logic lives in the download route, which is the only thing that resolves
     * a file to bytes.
     */
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    uploaderRole: { type: String, enum: ["teacher", "student"], required: true },

    /**
     * The college the file belongs to.
     *
     * Copied from the uploader's profile, never from the request. It is the
     * first thing the download route checks, so a file can never cross a
     * college boundary even if every other check were somehow bypassed.
     */
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },

    fileName: { type: String, required: true, maxlength: 260 },
    mimeType: { type: String, required: true, maxlength: 120 },
    /** Bytes. Validated against the per-purpose cap before the write. */
    size: { type: Number, required: true, min: 0 },

    /** Where the driver put it. Opaque to everything except the driver. */
    storageKey: { type: String, required: true, maxlength: 400 },
    /** Which driver wrote it, so a half-migrated deployment still resolves. */
    driver: { type: String, required: true, maxlength: 40 },

    /** sha256 of the bytes, for deduplication and integrity. */
    checksum: { type: String, default: null, maxlength: 64 },

    /**
     * What this file was ultimately attached to. Null until the form is saved.
     *
     * Not a foreign key with a `ref`, because it points at three different
     * collections. It is used for the orphan sweep and for tracing a file back
     * to its item, never populated blindly.
     */
    attachedToType: {
      type: String,
      enum: ["assignment", "note", "submission"],
      default: null,
    },
    attachedToId: { type: Schema.Types.ObjectId, default: null },

    /**
     * §86 asks for antivirus scanning "if infrastructure supports it". No
     * scanner is wired up, so uploads land as `skipped` rather than as `clean`
     * — recording that nothing checked, instead of claiming something did.
     * The download route refuses `infected` and will refuse `pending` once a
     * real scanner makes that state reachable.
     */
    scanStatus: { type: String, enum: FILE_SCAN_STATUSES, default: "skipped" },

    downloadCount: { type: Number, default: 0, min: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** The orphan sweep: uploads nothing ever claimed. */
storedFileSchema.index({ attachedToId: 1, createdAt: 1 });
/** "Every file on this assignment", for cascade cleanup. */
storedFileSchema.index({ attachedToType: 1, attachedToId: 1 });
/** Per-uploader rate accounting and a user's own upload history. */
storedFileSchema.index({ uploadedBy: 1, createdAt: -1 });

export type StoredFileDoc = InferSchemaType<typeof storedFileSchema>;

resetModelInDev("StoredFile");

export const StoredFile: Model<StoredFileDoc> =
  (mongoose.models.StoredFile as Model<StoredFileDoc>) ||
  mongoose.model<StoredFileDoc>("StoredFile", storedFileSchema);

/**
 * The attachment as it is denormalised onto an assignment, note or submission.
 *
 * Exported as a schema rather than duplicated three times, so the three items
 * cannot drift into three shapes the UI has to special-case. `fileId` is the
 * link back to the authority; everything else is a copy taken at attach time,
 * which is what lets an attachment list render with no join and still show a
 * sensible name for a file whose row has since been swept.
 */
export const attachmentSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "StoredFile", required: true },
    fileName: { type: String, required: true, maxlength: 260 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

export type Attachment = InferSchemaType<typeof attachmentSchema>;
