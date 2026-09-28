import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { attachmentSchema } from "@/models/StoredFile";
import { academicTarget, targetSnapshotSchema } from "@/models/Assignment";
import { NOTE_STATUSES, NOTE_TYPES, TEACHING_LIMITS } from "@/lib/teaching/fields";

/**
 * Notes: the study material a teacher shares.
 *
 * Targeted by the same academic coordinate as an assignment, and deliberately
 * *not* modelled as one. §28 is right that they are different things: an
 * assignment is owed back and has a deadline, a state machine per student and a
 * grade; a note is a resource that is simply there. Forcing both into one
 * collection would mean every note carrying a null `dueAt`, a null `maxMarks`
 * and a submission type it can never have — and a student's "pending" filter
 * having to know which rows are not really work.
 *
 * What they *do* share is the targeting, and that is shared as code:
 * `academicTarget()` and `targetSnapshotSchema` come from `Assignment.ts`, so
 * the two cannot drift into two definitions of who receives something.
 */

const externalLinkSchema = new Schema(
  {
    label: { type: String, default: null, maxlength: 200 },
    url: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false }
);

const noteSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "TeacherProfile", required: true, index: true },
    teacherUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    ...academicTarget(),

    title: { type: String, required: true, trim: true, maxlength: TEACHING_LIMITS.titleMax },
    description: { type: String, default: null, maxlength: TEACHING_LIMITS.descriptionMax },
    /** Written notes, when the teacher types rather than attaches. */
    content: { type: String, default: null, maxlength: TEACHING_LIMITS.noteContentMax },

    attachments: { type: [attachmentSchema], default: [] },
    externalLinks: { type: [externalLinkSchema], default: [] },

    /**
     * Derived from the content at write time, never asked for.
     *
     * A teacher choosing "PDF" and attaching slides is a mismatch nobody would
     * notice, and the type only ever picks an icon and drives a filter —
     * so computing it means the filter cannot lie.
     */
    noteType: { type: String, enum: NOTE_TYPES, default: "text" },

    status: { type: String, enum: NOTE_STATUSES, default: "draft", index: true },

    targetSnapshot: { type: targetSnapshotSchema, default: null },

    // ── Engagement (§47) ──────────────────────────────────────────────────
    /**
     * Counters, incremented by the view and download routes.
     *
     * `viewCount` counts opens and `uniqueViewerCount` counts people, because
     * "164 views by 78 students" and "164 views by 164 students" are different
     * facts and a teacher deciding whether the note landed needs the second.
     * The distinct set lives in `NoteView`; this is the roll-up.
     */
    viewCount: { type: Number, default: 0, min: 0 },
    uniqueViewerCount: { type: Number, default: 0, min: 0 },
    downloadCount: { type: Number, default: 0, min: 0 },
    bookmarkCount: { type: Number, default: 0, min: 0 },
    /** How many students it was published to — the denominator (§47). */
    audienceCount: { type: Number, default: 0, min: 0 },

    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** §76's indexes. */
noteSchema.index({ collegeId: 1, semester: 1, subjectId: 1, status: 1 });
noteSchema.index({ teacherUserId: 1, createdAt: -1 });
noteSchema.index({ status: 1, publishedAt: -1 });
/** The student's notes list: everything published for a subject they take. */
noteSchema.index({ subjectId: 1, status: 1, publishedAt: -1 });
noteSchema.index({ title: "text", description: "text" });

export type NoteDoc = InferSchemaType<typeof noteSchema>;
export type ExternalLink = InferSchemaType<typeof externalLinkSchema>;

resetModelInDev("Note");

export const Note: Model<NoteDoc> =
  (mongoose.models.Note as Model<NoteDoc>) || mongoose.model<NoteDoc>("Note", noteSchema);

// ── Who a note reached (§61) ──────────────────────────────────────────────

/**
 * One row per student per published note.
 *
 * The same materialisation as `AssignmentStudent`, for the same reason and one
 * more: it is what makes a note *stay* with the student who received it. A
 * student who moves to Year 3 keeps last semester's notes — resolving the
 * audience live on every read would take them away, which is precisely the
 * "historical notes remain accessible" line in §101.
 *
 * It is far lighter than `AssignmentStudent` because a note has no state
 * machine: it was received, and it may have been read.
 */
const noteRecipientSchema = new Schema(
  {
    noteId: { type: Schema.Types.ObjectId, ref: "Note", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "CurriculumSubject", required: true },
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true },
    /** Denormalised for the student's list ordering. */
    publishedAt: { type: Date, default: null },
    viewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

noteRecipientSchema.index({ noteId: 1, studentId: 1 }, { unique: true });
/** The student's notes page, newest first. */
noteRecipientSchema.index({ studentId: 1, publishedAt: -1 });
noteRecipientSchema.index({ studentId: 1, subjectId: 1, publishedAt: -1 });

export type NoteRecipientDoc = InferSchemaType<typeof noteRecipientSchema>;

resetModelInDev("NoteRecipient");

export const NoteRecipient: Model<NoteRecipientDoc> =
  (mongoose.models.NoteRecipient as Model<NoteRecipientDoc>) ||
  mongoose.model<NoteRecipientDoc>("NoteRecipient", noteRecipientSchema);

// ── Distinct viewers (§47) ────────────────────────────────────────────────

/**
 * One row the first time a student opens a note.
 *
 * Separate from `NoteRecipient.viewedAt` — which records *whether* — because
 * this counts opens, and the two answer different questions. Kept as its own
 * collection rather than an array on the note: a note read by four hundred
 * students would otherwise be a document with a four-hundred-element array
 * that every read loads in full.
 */
const noteViewSchema = new Schema(
  {
    noteId: { type: Schema.Types.ObjectId, ref: "Note", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    views: { type: Number, default: 1, min: 1 },
    downloads: { type: Number, default: 0, min: 0 },
    firstViewedAt: { type: Date, default: Date.now },
    lastViewedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/** The upsert key — the unique index is what makes "unique viewers" true. */
noteViewSchema.index({ noteId: 1, studentId: 1 }, { unique: true });

export type NoteViewDoc = InferSchemaType<typeof noteViewSchema>;

resetModelInDev("NoteView");

export const NoteView: Model<NoteViewDoc> =
  (mongoose.models.NoteView as Model<NoteViewDoc>) ||
  mongoose.model<NoteViewDoc>("NoteView", noteViewSchema);

// ── Bookmarks (§72) ───────────────────────────────────────────────────────

/**
 * A saved note.
 *
 * Its own collection rather than a `type: "note"` row in the existing
 * polymorphic `Bookmark`, and the reason is the counter: §47 wants
 * `bookmarkCount` per note, which means incrementing the note on every save,
 * which means the writer has to know it is dealing with a note. A polymorphic
 * collection whose writer branches on the type is two collections wearing one
 * name — and the shared one would still need this table's unique index scoped
 * to notes to be correct.
 */
const noteBookmarkSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    noteId: { type: Schema.Types.ObjectId, ref: "Note", required: true, index: true },
    /** Snapshot, so the list renders even for a note since archived (§58). */
    noteTitle: { type: String, default: null, maxlength: 200 },
    subjectName: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true }
);

/** Saving twice is a no-op, enforced rather than checked. */
noteBookmarkSchema.index({ studentId: 1, noteId: 1 }, { unique: true });
noteBookmarkSchema.index({ studentId: 1, createdAt: -1 });

export type NoteBookmarkDoc = InferSchemaType<typeof noteBookmarkSchema>;

resetModelInDev("NoteBookmark");

export const NoteBookmark: Model<NoteBookmarkDoc> =
  (mongoose.models.NoteBookmark as Model<NoteBookmarkDoc>) ||
  mongoose.model<NoteBookmarkDoc>("NoteBookmark", noteBookmarkSchema);
