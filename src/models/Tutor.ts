import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { DEPTH_LEVELS, LEARNING_LANGUAGES } from "@/lib/learning/fields";

/**
 * The AI tutor's own data: conversations, the interactions inside them, the
 * answer cache, and the usage roll-up that keeps spending visible.
 *
 * Everything here is **assistance**, not curriculum (§54). Nothing in this file
 * is ever read as a syllabus, and nothing written here can change one. The
 * separation is physical rather than a convention: `Topic` and `TopicContent`
 * live in `Topic.ts` and are written only by administrators; these four
 * collections are written only by the tutor pipeline, and no code path joins
 * them into curriculum output.
 *
 *   AiConversation ── AiInteraction[]   one thread about one topic
 *   AiAnswerCache                       question → answer, reused across students
 *   AiUsageDaily                        what it all cost, per day
 */

// ── Conversation (§13) ────────────────────────────────────────────────────

/**
 * One thread, about one topic.
 *
 * Deliberately *not* one conversation per student (§13). A single lifetime
 * thread would mean every request either carries the student's whole history as
 * context — which is unaffordable and gets worse every week — or carries an
 * arbitrary tail of it, which is worse still because the model then answers a
 * data-structures question with the residue of a thermodynamics one.
 *
 * A student may hold several threads on the same topic: "basic explanation",
 * "interview preparation" and "advanced implementation" are genuinely different
 * conversations, and merging them is what makes a tutor forget which one it is
 * in.
 */
const aiConversationSchema = new Schema(
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
     * Snapshots, so a renamed or archived topic still renders in history (§58).
     * The ids above stay the join; these are what the list actually displays.
     */
    subjectName: { type: String, default: null, maxlength: 300 },
    topicTitle: { type: String, default: null, maxlength: 300 },

    /** Derived from the first question, so the list is readable without one. */
    title: { type: String, default: null, maxlength: 200 },

    /** The level the thread is currently pitched at. Moves as the student climbs. */
    depthLevel: { type: String, enum: DEPTH_LEVELS, default: "basic" },
    language: { type: String, enum: LEARNING_LANGUAGES, default: "english" },

    messageCount: { type: Number, default: 0, min: 0 },
    lastMessageAt: { type: Date, default: null },

    /**
     * A running summary of the turns too old to send verbatim (§66).
     *
     * Written by the context builder once a thread outgrows its window. Keeping
     * it on the conversation rather than recomputing per request is the point:
     * summarising costs a model call, and doing it on every question would cost
     * more than the history it is saving.
     */
    summary: { type: String, default: null, maxlength: 4000 },
    /** How many interactions the summary already covers, so it is not redone. */
    summarizedThrough: { type: Number, default: 0, min: 0 },

    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** The topic page's "your conversations" list, newest first (§48). */
aiConversationSchema.index({ userId: 1, topicId: 1, updatedAt: -1 });
/** The AI Tutor hub: everything this student has going, across topics. */
aiConversationSchema.index({ userId: 1, updatedAt: -1 });

export type AiConversationDoc = InferSchemaType<typeof aiConversationSchema>;

resetModelInDev("AiConversation");

export const AiConversation: Model<AiConversationDoc> =
  (mongoose.models.AiConversation as Model<AiConversationDoc>) ||
  mongoose.model<AiConversationDoc>("AiConversation", aiConversationSchema);

// ── Interaction (§14, §23) ────────────────────────────────────────────────

/**
 * The structured answer, as the model returned it and the schema validated it.
 *
 * Fields rather than a `Mixed` blob because the UI renders each section
 * differently and §64 forbids parsing markdown to decide application state.
 * All nullable: a model that had nothing useful to say about `commonMistakes`
 * must return null, not an invented list.
 */
const answerSchema = new Schema(
  {
    title: { type: String, default: null, maxlength: 300 },
    summary: { type: String, default: null, maxlength: 2000 },
    explanation: { type: String, default: null, maxlength: 20000 },
    practicalExample: { type: String, default: null, maxlength: 8000 },
    code: { type: String, default: null, maxlength: 8000 },
    codeLanguage: { type: String, default: null, maxlength: 40 },
    keyPoints: { type: [String], default: [] },
    commonMistakes: { type: [String], default: [] },
    relatedConcepts: { type: [String], default: [] },
    nextTopics: { type: [String], default: [] },
    difficulty: { type: String, default: null, maxlength: 40 },
    /**
     * Set when the question was not about this topic (§12 rules 11-12).
     *
     * Stored rather than discarded: it is the honest record of what happened,
     * and the UI shows it as a note above the answer instead of pretending the
     * question was on-syllabus.
     */
    offTopicNote: { type: String, default: null, maxlength: 600 },
  },
  { _id: false }
);

/**
 * One question and its answer.
 *
 * Every AI request is stored (§14), including the ones served from cache and
 * the ones that failed. A store of only the successes would make the failure
 * rate (§34) unmeasurable and the "why did I get charged" question
 * unanswerable.
 */
const aiInteractionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "AiConversation",
      required: true,
      index: true,
    },

    subjectId: { type: Schema.Types.ObjectId, ref: "CurriculumSubject", required: true },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    subtopicId: { type: Schema.Types.ObjectId, ref: "Subtopic", default: null },

    /** Position in the thread, so an ordered read needs no timestamp tiebreak. */
    sequence: { type: Number, required: true, min: 1 },

    question: { type: String, required: true, maxlength: 4000 },
    /**
     * The question, lowercased and stripped of filler — the cache key (§17).
     *
     * Stored alongside the raw text rather than only hashed, so an operator
     * looking at a cache hit can see *why* two questions were treated as the
     * same one. A hash alone makes a bad normalisation impossible to diagnose.
     */
    normalizedQuestion: { type: String, default: null, maxlength: 500 },
    questionHash: { type: String, default: null, index: true, maxlength: 64 },

    answer: { type: answerSchema, default: null },
    /** The raw text, when the response failed validation — for diagnosis only. */
    rawResponse: { type: String, default: null, maxlength: 40000 },

    depthLevel: { type: String, enum: DEPTH_LEVELS, default: "basic" },
    language: { type: String, enum: LEARNING_LANGUAGES, default: "english" },

    /** Which quick action produced this, when it was not free text (§16). */
    followUpAction: { type: String, default: null, maxlength: 40 },

    // ── Provenance and cost (§14, §34, §52) ───────────────────────────────
    provider: { type: String, default: null, maxlength: 40 },
    model: { type: String, default: null, maxlength: 120 },
    promptVersion: { type: String, default: null, maxlength: 40 },
    /** Hash of the context block, so two answers can be compared fairly (§22). */
    contextHash: { type: String, default: null, maxlength: 64 },

    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    totalTokens: { type: Number, default: 0, min: 0 },
    /**
     * Estimated cost in micro-USD (millionths).
     *
     * An integer, because floating-point dollars accumulated over a hundred
     * thousand rows drift, and because `$inc` on a float in the daily roll-up
     * would drift differently.
     */
    estimatedCostMicros: { type: Number, default: 0, min: 0 },

    latencyMs: { type: Number, default: 0, min: 0 },
    /** True when no provider was called — the answer came from the cache (§15). */
    cacheHit: { type: Boolean, default: false },
    /** Which provider was tried and failed before this one succeeded (§68). */
    fallbackFrom: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["ok", "failed", "filtered", "rate-limited", "budget-exceeded"],
      default: "ok",
      index: true,
    },
    /** Operator-facing. Never returned to the browser verbatim (§51). */
    errorCode: { type: String, default: null, maxlength: 60 },
    errorMessage: { type: String, default: null, maxlength: 1000 },

    /**
     * The interaction this one re-answers (§15 "Ask again", §40 "Regenerate").
     *
     * A pointer rather than an overwrite: both answers are kept so a student can
     * compare them, and so a regeneration that came out worse has not destroyed
     * the one that was fine.
     */
    regeneratedFromId: { type: Schema.Types.ObjectId, ref: "AiInteraction", default: null },

    helpful: { type: Boolean, default: null },
  },
  { timestamps: true }
);

/** §23's indexes, exactly. */
aiInteractionSchema.index({ userId: 1, createdAt: -1 });
aiInteractionSchema.index({ userId: 1, topicId: 1, createdAt: -1 });
aiInteractionSchema.index({ conversationId: 1, sequence: 1 });
aiInteractionSchema.index({ topicId: 1, questionHash: 1 });
/** The daily quota count (§33) and the cost dashboard (§34). */
aiInteractionSchema.index({ userId: 1, status: 1, createdAt: -1 });

export type AiInteractionDoc = InferSchemaType<typeof aiInteractionSchema>;
export type AiAnswerPayload = InferSchemaType<typeof answerSchema>;

resetModelInDev("AiInteraction");

export const AiInteraction: Model<AiInteractionDoc> =
  (mongoose.models.AiInteraction as Model<AiInteractionDoc>) ||
  mongoose.model<AiInteractionDoc>("AiInteraction", aiInteractionSchema);

// ── Answer cache (§17, §47) ───────────────────────────────────────────────

/**
 * A question that has already been answered, reusable by anyone on that topic.
 *
 * Cross-student on purpose, and safe to be: the key includes the topic, the
 * normalised question, the depth level, the language and the prompt version,
 * and the *value* holds nothing personal — a topic explanation is the same
 * explanation whoever asked for it. Nothing student-specific is cached
 * globally (§47), which is why the pipeline skips the cache entirely once a
 * question has conversation history behind it: at that point the answer depends
 * on what *this* student asked before, and reusing it would leak one thread
 * into another.
 *
 * `promptVersion` is in the key rather than being a field, so changing the
 * system prompt invalidates the cache instead of quietly serving answers
 * produced under rules that no longer apply (§32).
 */
const aiAnswerCacheSchema = new Schema(
  {
    /** sha256 of topicId + normalised question + depth + language + prompt version. */
    key: { type: String, required: true, unique: true, maxlength: 64 },

    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    normalizedQuestion: { type: String, required: true, maxlength: 500 },
    depthLevel: { type: String, enum: DEPTH_LEVELS, required: true },
    language: { type: String, enum: LEARNING_LANGUAGES, default: "english" },
    promptVersion: { type: String, required: true, maxlength: 40 },

    answer: { type: answerSchema, required: true },

    provider: { type: String, default: null, maxlength: 40 },
    model: { type: String, default: null, maxlength: 120 },
    /** What the original generation cost, for reporting the saving (§34). */
    originalCostMicros: { type: Number, default: 0 },

    hits: { type: Number, default: 0, min: 0 },
    lastHitAt: { type: Date, default: null },

    /**
     * When this entry stops being served.
     *
     * A TTL rather than manual invalidation, because the thing that would
     * invalidate it — a better model, a reworded prompt — already changes the
     * key. The expiry exists so a bad answer cannot be served for a year, not
     * because the content goes stale.
     */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

aiAnswerCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/** "Most asked questions on this topic" (§53), and the cache-hit dashboard. */
aiAnswerCacheSchema.index({ topicId: 1, hits: -1 });

export type AiAnswerCacheDoc = InferSchemaType<typeof aiAnswerCacheSchema>;

resetModelInDev("AiAnswerCache");

export const AiAnswerCache: Model<AiAnswerCacheDoc> =
  (mongoose.models.AiAnswerCache as Model<AiAnswerCacheDoc>) ||
  mongoose.model<AiAnswerCacheDoc>("AiAnswerCache", aiAnswerCacheSchema);

// ── Usage roll-up (§34, §69) ──────────────────────────────────────────────

/**
 * One document per day per provider and model.
 *
 * A roll-up rather than an aggregation over `AiInteraction`, for one reason
 * that matters: §69's budget check runs *before every request*, and a
 * `$group` over a growing interaction collection on the hot path is the kind of
 * query that is fine for a month and then is not. An upsert with `$inc` is a
 * single indexed write, and the month-to-date total is a scan of at most
 * thirty-one small documents.
 *
 * The month is stored alongside the day so that scan is an index lookup rather
 * than a range on a string date.
 */
const aiUsageDailySchema = new Schema(
  {
    /** `YYYY-MM-DD`, in UTC. A string because it is an identity, not an instant. */
    day: { type: String, required: true, maxlength: 10 },
    /** `YYYY-MM`, the budget window. */
    month: { type: String, required: true, index: true, maxlength: 7 },

    provider: { type: String, required: true, maxlength: 40 },
    model: { type: String, required: true, maxlength: 120 },

    requests: { type: Number, default: 0 },
    cacheHits: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },

    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    estimatedCostMicros: { type: Number, default: 0 },

    totalLatencyMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

aiUsageDailySchema.index({ day: 1, provider: 1, model: 1 }, { unique: true });
aiUsageDailySchema.index({ month: 1, provider: 1 });

export type AiUsageDailyDoc = InferSchemaType<typeof aiUsageDailySchema>;

resetModelInDev("AiUsageDaily");

export const AiUsageDaily: Model<AiUsageDailyDoc> =
  (mongoose.models.AiUsageDaily as Model<AiUsageDailyDoc>) ||
  mongoose.model<AiUsageDailyDoc>("AiUsageDaily", aiUsageDailySchema);
