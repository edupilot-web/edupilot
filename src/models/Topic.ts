import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { LEARNING_LANGUAGES, TOPIC_CONTENT_STATUSES } from "@/lib/learning/fields";

/**
 * The topic layer: the leaf a student actually opens to learn something.
 *
 * This sits *below* `CurriculumSubject` and above nothing — it is the bottom of
 * the official curriculum, and the anchor every learning feature hangs off:
 *
 *   CurriculumSubject ── units[] ────────► the syllabus, verbatim (exam scope)
 *          │                    │
 *          │                    └── unit.topics[]  titles, as free strings
 *          │
 *          └── Topic ──┬── Subtopic          the outline, as addressable rows
 *                      ├── TopicContent      what a student reads (no LLM call)
 *                      ├── StudentTopicProgress
 *                      └── AiInteraction     what they asked the tutor
 *
 * **Why a collection and not the strings that already exist.** `units[].topics`
 * is an array of titles inside the subject document. That is the right shape for
 * *displaying a syllabus* and the wrong shape for everything else: a title
 * cannot be progressed against, bookmarked, asked a question about, or given
 * content — all of those need a stable id that survives the title being
 * reworded (§58). The strings stay exactly where they are and stay
 * authoritative; `Topic` is materialised *from* them (`npm run seed:topics`) and
 * carries `unitNumber` back to the unit it came from, so the syllabus is never a
 * copy that can drift into a second opinion.
 *
 * **Why keyed on the subject and not shared across colleges.** A
 * `CurriculumSubject` row is already one subject, of one branch, under one
 * regulation, at one college (§2, §55). Hanging topics off it means two colleges
 * that teach Data Structures differently get different topic lists for free,
 * R20 keeps its own list when R23 arrives (§56), and no query anywhere has to
 * re-check which college a topic belongs to — the subject already answered that.
 * Reuse across colleges happens at the *content* level, where it is safe:
 * `TopicContent` is addressed by topic, and two topics sharing a `canonicalKey`
 * can share generated material without sharing an id.
 */

// ── Topic ─────────────────────────────────────────────────────────────────

export const TOPIC_DIFFICULTIES = ["basic", "intermediate", "advanced"] as const;
export type TopicDifficultyLevel = (typeof TOPIC_DIFFICULTIES)[number];

/** Where the row came from, so a re-materialisation knows what it may touch. */
export const TOPIC_SOURCES = ["syllabus", "manual", "import", "ai-structure"] as const;
export type TopicSource = (typeof TOPIC_SOURCES)[number];

export const TOPIC_STATUSES = ["draft", "published", "archived"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

const topicSchema = new Schema(
  {
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "CurriculumSubject",
      required: true,
      index: true,
    },

    /**
     * The syllabus unit this topic belongs to, by its number on
     * `CurriculumSubject.units`.
     *
     * A number rather than a reference because units are embedded and their
     * number *is* their address — the same choice `SubjectTextbook.unitMappings`
     * and `AiCourseContent` already make. Null is legitimate: a subject whose
     * syllabus is free text has topics with no unit to belong to.
     */
    unitNumber: { type: Number, default: null, min: 1, max: 30 },
    /** The unit's title at materialisation time, for headings without a join. */
    unitTitle: { type: String, default: null, maxlength: 300 },

    title: { type: String, required: true, trim: true, maxlength: 300 },
    /**
     * URL-safe form of the title, unique within the subject.
     *
     * Not used for routing — routes use the id, because a slug changes when a
     * title is corrected and §58 requires old links and old AI history to keep
     * resolving. It exists for search, for deduplicating a re-import, and as the
     * base of the canonical key below.
     */
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },

    description: { type: String, default: null, maxlength: 2000 },

    /**
     * Position in the subject, 1-based and contiguous.
     *
     * Across the whole subject rather than within the unit, because that is the
     * order a student learns in and the number the UI shows ("Topic 7 of 20").
     * The unit is recoverable from `unitNumber`; a per-unit sequence would make
     * "the next topic" a two-field comparison for no gain.
     */
    sequence: { type: Number, required: true, min: 1, max: 500 },

    difficulty: { type: String, enum: TOPIC_DIFFICULTIES, default: "basic" },
    /** Rough study time, for "about 25 minutes" on the topic card. */
    estimatedMinutes: { type: Number, default: null, min: 1, max: 600 },

    /**
     * Authoritative topic relationships (§43).
     *
     * Stored rather than inferred, because "what does this build on" is an
     * academic judgement and a model guessing it would put a wrong prerequisite
     * in front of a student as if the college had said so. The AI may *suggest*
     * related topics in an answer; those live on the interaction, not here.
     */
    prerequisiteTopicIds: { type: [Schema.Types.ObjectId], ref: "Topic", default: [] },
    relatedTopicIds: { type: [Schema.Types.ObjectId], ref: "Topic", default: [] },

    learningObjectives: { type: [String], default: [] },
    /** Search terms and grounding hints. */
    keywords: { type: [String], default: [] },

    /**
     * A stable, college-independent identity for "the same topic elsewhere".
     *
     * Derived from the title alone, so "Linked Lists" under R20 CSE at one
     * college and under R23 IT at another collide deliberately. Nothing *joins*
     * on it; it is what lets generated content be reused across curricula (§55)
     * and what "most asked topics" aggregates by, without ever merging two
     * colleges' curriculum rows.
     */
    canonicalKey: { type: String, default: null, index: true, maxlength: 160 },

    source: { type: String, enum: TOPIC_SOURCES, default: "syllabus" },
    status: { type: String, enum: TOPIC_STATUSES, default: "published", index: true },

    /** Denormalised counters, so a topic list renders with no per-row query. */
    subtopicCount: { type: Number, default: 0 },
    /** Whether published `TopicContent` exists — drives "Read" vs "Ask AI". */
    hasPublishedContent: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

/**
 * The subject screen's read, and the ordering invariant (§48, §49).
 *
 * Unique on `(subjectId, sequence)`: two topics at position 3 is a data error,
 * and refusing it on write means a re-materialisation converges instead of
 * silently doubling the syllabus. The same index serves the ordered list, since
 * the prefix is usable alone.
 */
topicSchema.index({ subjectId: 1, sequence: 1 }, { unique: true });
/** The natural key a re-import upserts on — a title cannot repeat in a subject. */
topicSchema.index({ subjectId: 1, slug: 1 }, { unique: true });
topicSchema.index({ subjectId: 1, unitNumber: 1, sequence: 1 });
topicSchema.index({ title: "text", keywords: "text" });

export type TopicDoc = InferSchemaType<typeof topicSchema>;

resetModelInDev("Topic");

export const Topic: Model<TopicDoc> =
  (mongoose.models.Topic as Model<TopicDoc>) || mongoose.model<TopicDoc>("Topic", topicSchema);

// ── Subtopic ──────────────────────────────────────────────────────────────

/**
 * A subdivision of a topic.
 *
 * Its own collection rather than an embedded array, unlike syllabus units and
 * book chapters, and for the reason those two are embedded: they do not grow.
 * A subtopic is an addressable target for an AI question (§30 sends a
 * `subtopicId`) and eventually for practice, so it needs an id that outlives an
 * edit to its parent's array ordering.
 */
const subtopicSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    /** Denormalised so a subtopic can be authorised without loading its topic. */
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "CurriculumSubject",
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: null, maxlength: 2000 },
    sequence: { type: Number, required: true, min: 1, max: 200 },

    status: { type: String, enum: TOPIC_STATUSES, default: "published" },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

subtopicSchema.index({ topicId: 1, sequence: 1 }, { unique: true });

export type SubtopicDoc = InferSchemaType<typeof subtopicSchema>;

resetModelInDev("Subtopic");

export const Subtopic: Model<SubtopicDoc> =
  (mongoose.models.Subtopic as Model<SubtopicDoc>) ||
  mongoose.model<SubtopicDoc>("Subtopic", subtopicSchema);

// ── Topic content ─────────────────────────────────────────────────────────

/**
 * One question a student can self-check against, before any LLM is involved.
 *
 * The answer is stored with the question because §8's "Check Your Understanding"
 * must not cost a request to reveal — a check that calls a model to mark itself
 * is a check most students will never finish waiting for.
 */
const checkQuestionSchema = new Schema(
  {
    question: { type: String, required: true, maxlength: 600 },
    answer: { type: String, required: true, maxlength: 2000 },
    hint: { type: String, default: null, maxlength: 400 },
  },
  { _id: false }
);

const codeExampleSchema = new Schema(
  {
    language: { type: String, default: null, maxlength: 40 },
    code: { type: String, required: true, maxlength: 8000 },
    explanation: { type: String, default: null, maxlength: 4000 },
    output: { type: String, default: null, maxlength: 2000 },
  },
  { _id: false }
);

const termSchema = new Schema(
  {
    term: { type: String, required: true, maxlength: 120 },
    meaning: { type: String, required: true, maxlength: 600 },
  },
  { _id: false }
);

/**
 * What a student reads when they open a topic — the whole point of §9.
 *
 * Separate from `Topic` so a content team can rewrite an explanation without
 * touching the curriculum structure, and so the *structure* can be published
 * while the *content* is still in review. They have different lifecycles, and a
 * single document would force a topic back into review every time a typo was
 * fixed in its prose.
 *
 * Nothing here is generated on demand. This is the layer that makes the topic
 * page load with no provider call (§9, §76); the LLM enters only at "Go deeper"
 * and "Ask AI", and what it produces is stored on `AiInteraction`, never merged
 * back into this document (§22, §54).
 *
 * `language` is on the natural key rather than in a parallel collection, so
 * §82's Telugu content is an extra row and not a schema change.
 */
const topicContentSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    /** Denormalised: every read is "this topic, of a subject I authorised". */
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "CurriculumSubject",
      required: true,
      index: true,
    },

    language: { type: String, enum: LEARNING_LANGUAGES, default: "english" },

    // ── Level 1: basic (§10) ───────────────────────────────────────────────
    basicExplanation: { type: String, default: null, maxlength: 20000 },
    /** The one-line answer to "why does this exist". */
    whyItMatters: { type: String, default: null, maxlength: 1200 },
    /** Everyday comparison — §8 asks for one explicitly. */
    realWorldAnalogy: { type: String, default: null, maxlength: 2000 },
    terminology: { type: [termSchema], default: [] },

    // ── Level 2: practical (§10) ──────────────────────────────────────────
    practicalExplanation: { type: String, default: null, maxlength: 20000 },
    realWorldExamples: { type: [String], default: [] },
    codeExample: { type: codeExampleSchema, default: null },

    // ── Always shown ──────────────────────────────────────────────────────
    keyPoints: { type: [String], default: [] },
    commonMistakes: { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
    checkYourUnderstanding: { type: [checkQuestionSchema], default: [] },

    /**
     * A short bridge to the deeper material, not the deep material itself.
     *
     * Storing a full advanced treatment here would defeat §9's split: "Go
     * deeper" is the moment a student chooses to spend a request, and having
     * already paid for that text on every topic in the syllabus is exactly the
     * cost §17 exists to avoid.
     */
    advancedOverview: { type: String, default: null, maxlength: 6000 },

    // ── Provenance and review (§21, §46) ──────────────────────────────────
    status: { type: String, enum: TOPIC_CONTENT_STATUSES, default: "ai-draft", index: true },
    contentVersion: { type: Number, default: 1, min: 1 },

    /**
     * How this text came to exist.
     *
     * Recorded because §36 forbids presenting generated material as an official
     * syllabus, and the UI can only add that notice if the document says which
     * it is. `authored` means a human wrote it; the default is not that.
     */
    origin: {
      type: String,
      enum: ["ai-generated", "authored", "imported"],
      default: "ai-generated",
    },
    provider: { type: String, default: null, maxlength: 40 },
    model: { type: String, default: null, maxlength: 120 },
    promptVersion: { type: String, default: null, maxlength: 40 },
    generatedAt: { type: Date, default: null },
    /** The job that produced it, for tracing a bad batch back to its run. */
    generationJobId: { type: Schema.Types.ObjectId, ref: "AiGenerationJob", default: null },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    reviewedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    approvedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

/** One content document per topic and language — a second is a duplicate (§49). */
topicContentSchema.index({ topicId: 1, language: 1 }, { unique: true });
/** The reviewer's queue, and the subject-wide "how much is published" count. */
topicContentSchema.index({ subjectId: 1, status: 1 });
topicContentSchema.index({ status: 1, updatedAt: -1 });

export type TopicContentDoc = InferSchemaType<typeof topicContentSchema>;
export type TopicCheckQuestion = InferSchemaType<typeof checkQuestionSchema>;
export type TopicCodeExample = InferSchemaType<typeof codeExampleSchema>;
export type TopicTerm = InferSchemaType<typeof termSchema>;

resetModelInDev("TopicContent");

export const TopicContent: Model<TopicContentDoc> =
  (mongoose.models.TopicContent as Model<TopicContentDoc>) ||
  mongoose.model<TopicContentDoc>("TopicContent", topicContentSchema);
