import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * The textbook layer: books as a catalogue, their topics, and what each one
 * covers of a subject's syllabus.
 *
 * This sits *beside* the curriculum rather than inside it. `CurriculumSubject`
 * already owns the syllabus — units and the topic titles the regulation lists —
 * and that stays the authoritative outline, because it is what the exam follows
 * and what `AiCourseContent` addresses by `(subjectId, unitNumber, topicNumber)`.
 * Nothing here renumbers or replaces it.
 *
 *   CurriculumSubject ── units[] ─────────────► the spine: exam scope
 *          │
 *          └── SubjectTextbook ── unitMappings[] ──┐
 *                     │                            │ which chapters cover
 *                     ▼                            │ which syllabus unit
 *                  Textbook ── chapters[] ◄─────────┘
 *                     │
 *                     └── TextbookTopic  the reading material a student clicks
 *
 * The existing `CurriculumSubject.referenceBooks[]` is a bibliography — a title
 * and an ISBN, with no structure to read from. It is kept, and gains a pointer
 * into this catalogue, so the ninety subjects that already list books are not
 * rewritten and nothing has to be migrated before this is useful.
 */

// ── Textbook ──────────────────────────────────────────────────────────────

/**
 * One chapter of a book.
 *
 * Embedded, unlike topics below. A chapter is pure structure — a number, a
 * title, a page range — it is never read except as part of its book's contents,
 * and it will not grow fields. That is the same test `Curriculum.ts` applies to
 * syllabus units, and it comes out the same way.
 */
const textbookChapterSchema = new Schema(
  {
    chapterNumber: { type: Number, required: true, min: 0, max: 200 },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    pageStart: { type: Number, default: null, min: 0, max: 10000 },
    pageEnd: { type: Number, default: null, min: 0, max: 10000 },
    /** Topics counted at write time, so a contents list needs no aggregation. */
    topicCount: { type: Number, default: 0 },
  },
  { _id: false }
);

export const TEXTBOOK_STATUSES = ["active", "inactive", "archived"] as const;

/**
 * A book, once, for the whole platform.
 *
 * Deliberately not scoped to a college, a subject or a regulation: "Higher
 * Engineering Mathematics" is the prescribed text for dozens of subjects across
 * hundreds of colleges. A row per (subject, book) is how you end up with forty
 * spellings of one title and no way to tell they are the same book — which also
 * makes "what does this book cover across the platform" unanswerable.
 *
 * What varies per subject — the role the book plays and the units it covers —
 * lives on `SubjectTextbook`, not here.
 */
const textbookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    subtitle: { type: String, default: null, trim: true, maxlength: 300 },

    /**
     * An array, not a string. `referenceBooks.authors` is free text today and
     * cannot answer "other books by this author"; a book with four authors is
     * also the normal case, not the exception.
     */
    authors: { type: [String], default: [] },

    publisher: { type: String, default: null, trim: true, maxlength: 200 },
    edition: { type: String, default: null, trim: true, maxlength: 40 },
    /** Year of this edition, which is what a syllabus cites. */
    year: { type: Number, default: null, min: 1800, max: 2100 },

    isbn10: { type: String, default: null, trim: true, maxlength: 13 },
    isbn13: { type: String, default: null, trim: true, maxlength: 17 },

    language: { type: String, default: "English", maxlength: 40 },
    coverImageUrl: { type: String, default: null, maxlength: 600 },
    totalPages: { type: Number, default: null, min: 1, max: 10000 },

    /** Where the copy came from, when it is a legitimately free one. */
    sourceUrl: { type: String, default: null, maxlength: 600 },

    chapters: { type: [textbookChapterSchema], default: [] },

    /** Denormalised so a book card needs no count query. */
    chapterCount: { type: Number, default: 0 },
    topicCount: { type: Number, default: 0 },

    status: { type: String, enum: TEXTBOOK_STATUSES, default: "active", index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

/**
 * ISBN-13 is the identity when there is one, and often there is not — Indian
 * university editions and older printings frequently ship without one.
 *
 * Hence a *partial* unique index: it enforces one row per real ISBN while
 * letting any number of books have none, which a plain unique index would
 * refuse after the first null.
 */
textbookSchema.index(
  { isbn13: 1 },
  { unique: true, partialFilterExpression: { isbn13: { $type: "string" } } }
);

/**
 * The fallback identity, for the books with no ISBN.
 *
 * Title plus edition rather than title alone: the 43rd and 44th editions of a
 * classic are different books with different chapter numbering, and a mapping
 * built against one is wrong for the other.
 */
textbookSchema.index({ title: 1, edition: 1 });
/** Admin-side book search. */
textbookSchema.index({ title: "text", authors: "text", publisher: "text" });

export type TextbookChapter = InferSchemaType<typeof textbookChapterSchema>;
export type TextbookDoc = InferSchemaType<typeof textbookSchema>;

resetModelInDev("Textbook");

export const Textbook: Model<TextbookDoc> =
  (mongoose.models.Textbook as Model<TextbookDoc>) ||
  mongoose.model<TextbookDoc>("Textbook", textbookSchema);

// ── Textbook topic ────────────────────────────────────────────────────────

export const TOPIC_DIFFICULTIES = ["basic", "intermediate", "advanced"] as const;
export type TopicDifficulty = (typeof TOPIC_DIFFICULTIES)[number];

/**
 * One topic inside a chapter — the leaf a student actually opens.
 *
 * Its own collection, which is where this diverges from chapters and from
 * syllabus units, and for the reason those two are embedded: they do not grow.
 * A topic will. It is the anchor for generated content, notes, video links,
 * question banks and per-student progress, and it is the level searches and
 * progress aggregations run at. A textbook carries two to three hundred of
 * them, so embedding would mean loading every field of every topic just to
 * render a table of contents, and every progress write would contend on the
 * one book document.
 *
 * `chapterNumber` rather than a chapter id, because chapters are embedded and
 * their numbers are the stable address a book actually uses.
 */
const textbookTopicSchema = new Schema(
  {
    textbookId: { type: Schema.Types.ObjectId, ref: "Textbook", required: true, index: true },
    chapterNumber: { type: Number, required: true, min: 0, max: 200 },
    /** Position within the chapter — 3 is "1.3" when the chapter is 1. */
    topicNumber: { type: Number, required: true, min: 1, max: 200 },

    title: { type: String, required: true, trim: true, maxlength: 300 },
    summary: { type: String, default: null, maxlength: 2000 },

    pageStart: { type: Number, default: null, min: 0, max: 10000 },
    pageEnd: { type: Number, default: null, min: 0, max: 10000 },

    /** For "this unit is about 4 hours of reading" on the subject screen. */
    estimatedMinutes: { type: Number, default: null, min: 1, max: 6000 },
    difficulty: { type: String, enum: TOPIC_DIFFICULTIES, default: "basic" },

    /** Keywords for search and for grounding a generation on this topic. */
    keywords: { type: [String], default: [] },

    status: { type: String, enum: ["active", "inactive"], default: "active" },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

/**
 * The contents read, and the natural key.
 *
 * Unique on the triple: a book cannot have two topic 1.3s, and making that a
 * write-time error means a re-seed converges instead of duplicating. The same
 * index serves the ordered read of a whole book and of one chapter, since the
 * prefix is usable on its own.
 */
textbookTopicSchema.index(
  { textbookId: 1, chapterNumber: 1, topicNumber: 1 },
  { unique: true }
);
textbookTopicSchema.index({ title: "text", keywords: "text" });

export type TextbookTopicDoc = InferSchemaType<typeof textbookTopicSchema>;

resetModelInDev("TextbookTopic");

export const TextbookTopic: Model<TextbookTopicDoc> =
  (mongoose.models.TextbookTopic as Model<TextbookTopicDoc>) ||
  mongoose.model<TextbookTopicDoc>("TextbookTopic", textbookTopicSchema);

// ── Subject ↔ textbook mapping ────────────────────────────────────────────

export const TEXTBOOK_ROLES = ["primary", "reference", "supplementary"] as const;
export type TextbookRole = (typeof TEXTBOOK_ROLES)[number];

/**
 * Which syllabus unit a book's chapters cover.
 *
 * This is the whole reason the mapping is a table rather than a foreign key.
 * Units and chapters are many-to-many and out of order: syllabus Unit 1 may
 * span chapters 1 and 2, while chapter 3 serves Units 2 *and* 4, and a book
 * written for a different university covers the same ground in a different
 * sequence. A `subjectId → textbookId` pointer can only say "here is the book";
 * it cannot answer the question a student is actually asking, which is "what do
 * I read for Unit 1".
 *
 * `chapterNumbers` is the usual grain. `topicIds` is there for the cases where
 * a chapter is only partly relevant and naming the topics is more honest than
 * pointing at the whole chapter.
 */
const unitMappingSchema = new Schema(
  {
    /** The syllabus unit, by its number on `CurriculumSubject.units`. */
    unitNumber: { type: Number, required: true, min: 1, max: 30 },
    chapterNumbers: { type: [Number], default: [] },
    topicIds: { type: [Schema.Types.ObjectId], ref: "TextbookTopic", default: [] },
    /** e.g. "sections 2.4-2.9 only" — the caveat a mapping cannot encode. */
    note: { type: String, default: null, maxlength: 300 },
  },
  { _id: false }
);

/**
 * A book prescribed for a subject, and what it covers.
 *
 * Keyed on `subjectId` alone rather than on the academic coordinate: a
 * `CurriculumSubject` row already *is* one subject of one branch under one
 * regulation, and it carries the whole coordinate denormalised. Repeating
 * college and regulation here would be a second copy of a fact that can then
 * disagree with the first.
 */
const subjectTextbookSchema = new Schema(
  {
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "CurriculumSubject",
      required: true,
      index: true,
    },
    /**
     * Indexed on the field, which is also the reverse read — "every subject this
     * book is prescribed for". Declared here rather than as a second
     * `schema.index()` below, which would be the same index twice.
     */
    textbookId: { type: Schema.Types.ObjectId, ref: "Textbook", required: true, index: true },

    /** Denormalised label, so a subject's book list renders without a join. */
    textbookTitle: { type: String, default: null, maxlength: 300 },

    role: { type: String, enum: TEXTBOOK_ROLES, default: "primary" },
    /**
     * The one book the subject screen opens on.
     *
     * Separate from `role` because "primary" describes the book's standing on
     * the syllabus, while this decides what the UI shows first — and a subject
     * whose syllabus names two primary texts still has to open on one of them.
     */
    isPrimary: { type: Boolean, default: false },

    unitMappings: { type: [unitMappingSchema], default: [] },

    /**
     * How much of the syllabus this book covers, 0-100.
     *
     * Stated rather than computed from `unitMappings`: a book can map to every
     * unit and still cover each one thinly, and the number a student needs to
     * see is the honest judgement, not the count of filled rows.
     */
    coveragePercent: { type: Number, default: null, min: 0, max: 100 },

    /** Who checked the mapping against the actual book. Null means nobody yet. */
    verifiedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    verifiedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

/** One row per (subject, book) — the same book twice on one subject is a bug. */
subjectTextbookSchema.index({ subjectId: 1, textbookId: 1 }, { unique: true });
/** The subject screen's query: this subject's books, the primary one first. */
subjectTextbookSchema.index({ subjectId: 1, isPrimary: -1, role: 1 });

export type UnitMapping = InferSchemaType<typeof unitMappingSchema>;
export type SubjectTextbookDoc = InferSchemaType<typeof subjectTextbookSchema>;

resetModelInDev("SubjectTextbook");

export const SubjectTextbook: Model<SubjectTextbookDoc> =
  (mongoose.models.SubjectTextbook as Model<SubjectTextbookDoc>) ||
  mongoose.model<SubjectTextbookDoc>("SubjectTextbook", subjectTextbookSchema);

/** "1.3" — how a book refers to a topic, used in labels and in search results. */
export function topicLabel(chapterNumber: number, topicNumber: number): string {
  return `${chapterNumber}.${topicNumber}`;
}
