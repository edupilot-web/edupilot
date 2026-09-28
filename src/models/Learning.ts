import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  BOOKMARK_TYPES,
  LEARNING_EVENT_TYPES,
  PROGRESS_STATUSES,
} from "@/lib/learning/fields";

/**
 * What a student has done: progress, the event stream behind it, and bookmarks.
 *
 * Keyed on `userId` throughout, not on `studentProfileId`. The profile is a
 * document a student can in principle have replaced — §57 requires a profile
 * change (CSE → IT, one college to another) to *preserve* learning history, and
 * hanging progress off the profile is precisely how that history would be
 * orphaned. The user is the stable identity; the academic coordinate is
 * snapshotted onto each row instead, so a later change reads as "this is what
 * they were studying at the time" rather than as a broken pointer.
 */

// ── Student topic progress (§24) ──────────────────────────────────────────

/**
 * One row per student per topic.
 *
 * The flags are the facts and `progressPercentage` is derived from them by
 * `percentageFor` at write time (§24). Storing both looks redundant and is not:
 * the flags are what the topic page renders section by section, and the
 * percentage is what a subject-level aggregation sums without re-deriving five
 * booleans per row. They cannot drift because exactly one function writes both.
 */
const studentTopicProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "CurriculumSubject",
      required: true,
      index: true,
    },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },

    /**
     * The topic's title when the student studied it (§58).
     *
     * A snapshot, not a join. If the curriculum later renames "Linked List" to
     * "Linked Lists and Applications", a progress list rendered from the live
     * title would silently rewrite the student's own history; and if the topic
     * is archived out of a new regulation, a join would render a blank row.
     */
    topicTitle: { type: String, default: null, maxlength: 300 },

    status: { type: String, enum: PROGRESS_STATUSES, default: "not_started", index: true },
    progressPercentage: { type: Number, default: 0, min: 0, max: 100 },

    /** The meaningful actions §24 asks to be tracked instead of page visits. */
    basicViewed: { type: Boolean, default: false },
    practicalViewed: { type: Boolean, default: false },
    advancedViewed: { type: Boolean, default: false },
    checkAttempted: { type: Boolean, default: false },
    questionAsked: { type: Boolean, default: false },

    /**
     * Time on the topic, accumulated from the client in bounded increments.
     *
     * Every increment is clamped server-side. An unclamped counter fed by a
     * browser is not a measurement, it is a field anyone can write 10^9 into,
     * and it would be the number "learning time" analytics is built on.
     */
    timeSpentSeconds: { type: Number, default: 0, min: 0 },

    /** How many times the student asked the tutor about this topic. */
    questionsAsked: { type: Number, default: 0, min: 0 },

    /** The deepest level they have reached, for resuming where they left off. */
    deepestLevel: { type: String, default: null, maxlength: 20 },

    lastViewedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    /** Set only when the student pressed the button, not by the threshold. */
    manuallyCompletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** The uniqueness rule and the topic page's own read (§48). */
studentTopicProgressSchema.index({ userId: 1, topicId: 1 }, { unique: true });
/** "How far through this subject am I" — one index scan per subject card. */
studentTopicProgressSchema.index({ userId: 1, subjectId: 1, status: 1 });
/** "Continue learning" — the most recent thing they touched. */
studentTopicProgressSchema.index({ userId: 1, lastViewedAt: -1 });
/** Admin analytics: completion rate per topic (§53). */
studentTopicProgressSchema.index({ topicId: 1, status: 1 });

export type StudentTopicProgressDoc = InferSchemaType<typeof studentTopicProgressSchema>;

resetModelInDev("StudentTopicProgress");

export const StudentTopicProgress: Model<StudentTopicProgressDoc> =
  (mongoose.models.StudentTopicProgress as Model<StudentTopicProgressDoc>) ||
  mongoose.model<StudentTopicProgressDoc>("StudentTopicProgress", studentTopicProgressSchema);

// ── Learning events (§25) ─────────────────────────────────────────────────

/**
 * The append-only stream progress is computed from.
 *
 * Kept even though `StudentTopicProgress` already holds the summary, because
 * the summary cannot answer any question about *sequence* — how long between
 * opening a topic and asking the first question, which section students leave
 * from, whether a deeper explanation was requested before or after the
 * self-check. A roll-up can always be rebuilt from events; events cannot be
 * recovered from a roll-up.
 *
 * TTL'd at a year. These are analytics, not a record the platform owes anyone,
 * and an unbounded event collection is the one that eventually costs more than
 * everything else in the database put together.
 */
const learningEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    type: { type: String, enum: LEARNING_EVENT_TYPES, required: true, index: true },

    subjectId: { type: Schema.Types.ObjectId, ref: "CurriculumSubject", default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null, index: true },
    subtopicId: { type: Schema.Types.ObjectId, ref: "Subtopic", default: null },

    /** The cohort the event belongs to, for §53's per-curriculum analytics. */
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null, index: true },
    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", default: null },
    semester: { type: Number, default: null },

    /**
     * Small, typed extras — a depth level, a seconds count, an interaction id.
     *
     * `Mixed` and capped by the route that writes it rather than by the schema:
     * every event type wants a different key or two, and a column per type
     * would be forty nullable fields of which one is ever set.
     */
    meta: { type: Schema.Types.Mixed, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/** The per-student timeline. */
learningEventSchema.index({ userId: 1, createdAt: -1 });
/** Platform analytics: what is being studied, and when (§53). */
learningEventSchema.index({ type: 1, createdAt: -1 });
/**
 * Expiry. A year keeps a full academic cycle — which is the shortest window in
 * which "compared to last year" is a question anyone can ask.
 */
learningEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export type LearningEventDoc = InferSchemaType<typeof learningEventSchema>;

resetModelInDev("LearningEvent");

export const LearningEvent: Model<LearningEventDoc> =
  (mongoose.models.LearningEvent as Model<LearningEventDoc>) ||
  mongoose.model<LearningEventDoc>("LearningEvent", learningEventSchema);

// ── Bookmarks (§41) ───────────────────────────────────────────────────────

/**
 * A saved topic, subject or answer.
 *
 * One polymorphic collection rather than three, because the only query is "show
 * me everything I saved", possibly filtered by type — three collections would
 * make that a three-way merge in application code, sorted by hand.
 * `referenceId` is deliberately untyped by mongoose and always resolved through
 * the collection `type` names, never populated blindly.
 */
const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: BOOKMARK_TYPES, required: true },
    referenceId: { type: Schema.Types.ObjectId, required: true },

    /** A label captured at save time, so a deleted target still renders (§58). */
    label: { type: String, default: null, maxlength: 300 },
    /** Where clicking it goes. Stored so the list needs no per-type routing. */
    href: { type: String, default: null, maxlength: 400 },
    note: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true }
);

/** Saving the same thing twice is a no-op, enforced rather than checked. */
bookmarkSchema.index({ userId: 1, type: 1, referenceId: 1 }, { unique: true });
bookmarkSchema.index({ userId: 1, createdAt: -1 });

export type BookmarkDoc = InferSchemaType<typeof bookmarkSchema>;

resetModelInDev("Bookmark");

export const Bookmark: Model<BookmarkDoc> =
  (mongoose.models.Bookmark as Model<BookmarkDoc>) ||
  mongoose.model<BookmarkDoc>("Bookmark", bookmarkSchema);
