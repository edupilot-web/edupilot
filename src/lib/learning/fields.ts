/**
 * The learning module's vocabulary: depth levels, content statuses, event
 * types, follow-up actions.
 *
 * Plain data with no imports, so the models, the API routes, the prompt builder
 * and the screens all read one list — the same reason `admin/ai/fields.ts`
 * exists for the admin module. This file is what stops a depth level being
 * added to a schema enum, a dropdown and a prompt switch separately, which is
 * how three of them end up disagreeing on the fourth addition.
 */

// ── Depth levels (§10) ────────────────────────────────────────────────────

/**
 * How deep an explanation goes.
 *
 * `curriculum` is level 0 and is **not** a model call: it is the official
 * syllabus text, and it is in this list so the UI can present one continuous
 * ladder rather than "the syllabus" and "AI levels" as unrelated ideas. Every
 * other level is a request.
 *
 * The order is the ladder. A student starts at `basic` and climbs (§10 is
 * explicit that they must not be forced to start at Advanced), so an index into
 * this array is the whole of "one level deeper".
 */
export const DEPTH_LEVELS = [
  "curriculum",
  "basic",
  "practical",
  "intermediate",
  "advanced",
  "expert",
] as const;

export type DepthLevel = (typeof DEPTH_LEVELS)[number];

export const DEPTH_LEVEL_LABELS: Record<DepthLevel, string> = {
  curriculum: "Syllabus",
  basic: "Basic",
  practical: "Practical",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

export const DEPTH_LEVEL_BLURBS: Record<DepthLevel, string> = {
  curriculum: "What your syllabus prescribes, word for word.",
  basic: "The idea in plain language, from first principles.",
  practical: "Where it is used, with worked examples.",
  intermediate: "The mechanics, with the technical vocabulary.",
  advanced: "Full technical treatment, trade-offs and analysis.",
  expert: "Research and industry depth, edge cases and open problems.",
};

/** How each level is described *to the model* (§12 rule 19). */
export const DEPTH_LEVEL_DIRECTIONS: Record<DepthLevel, string> = {
  curriculum:
    "Restate only what the supplied syllabus says. Add no explanation of your own.",
  basic:
    "Explain from first principles in plain language. Assume no prior exposure to the topic. Define every term you use before you use it. Prefer a concrete example over a formal definition.",
  practical:
    "Lead with where this is actually used and a worked example. Keep theory to what the example needs.",
  intermediate:
    "Use the standard technical vocabulary of the field and explain the mechanism, not just the outcome. Assume the basic explanation has been read.",
  advanced:
    "Give a full technical treatment: formal definitions, complexity or derivations where they apply, trade-offs, and the cases where the simple account breaks down.",
  expert:
    "Discuss this at the level of a practitioner or researcher: design decisions, competing approaches, performance in the real world, and where the current understanding is incomplete.",
};

/** Levels a student may request. Level 0 is read from the database, never asked for. */
export const REQUESTABLE_DEPTH_LEVELS: readonly DepthLevel[] = [
  "basic",
  "practical",
  "intermediate",
  "advanced",
  "expert",
];

export function isDepthLevel(value: unknown): value is DepthLevel {
  return typeof value === "string" && (DEPTH_LEVELS as readonly string[]).includes(value);
}

/** The next rung up, or null at the top — what the "Go deeper" button targets. */
export function deeperThan(level: DepthLevel): DepthLevel | null {
  const index = DEPTH_LEVELS.indexOf(level);
  return index >= 0 && index < DEPTH_LEVELS.length - 1 ? DEPTH_LEVELS[index + 1] : null;
}

/**
 * Which levels warrant the better model (§18, §19).
 *
 * A tier rather than a per-level provider, because the mapping a deployment
 * cares about is "cheap vs capable" and encoding five providers in an
 * environment file is how one of them ends up unset.
 */
export type ModelTier = "default" | "advanced";

export function tierForDepth(level: DepthLevel): ModelTier {
  return level === "advanced" || level === "expert" ? "advanced" : "default";
}

// ── Languages (§82) ───────────────────────────────────────────────────────

/**
 * Content languages.
 *
 * English is the MVP and the default. Telugu and Hindi are listed now because
 * `TopicContent` is keyed on the language, and adding a value to a schema enum
 * later means migrating documents that were written without one.
 */
export const LEARNING_LANGUAGES = ["english", "telugu", "hindi"] as const;
export type LearningLanguage = (typeof LEARNING_LANGUAGES)[number];

export const LEARNING_LANGUAGE_LABELS: Record<LearningLanguage, string> = {
  english: "English",
  telugu: "తెలుగు (Telugu)",
  hindi: "हिन्दी (Hindi)",
};

// ── Topic content lifecycle (§28, §46) ────────────────────────────────────

/**
 * The review workflow for prepared learning content.
 *
 * Deliberately its own list rather than `AI_CONTENT_STATUSES` from the admin
 * module. That one models a *generation job's* document and carries
 * `generating` and `failed`, which are states of a job and not of a piece of
 * prose. Sharing it would mean a student-facing read has to know that
 * `failed` exists and decide what to show for it.
 *
 * Students see `published` and nothing else. There is no code path from
 * generation to `published` — approval and publication are separate, explicit
 * administrator actions (§45).
 */
export const TOPIC_CONTENT_STATUSES = [
  "ai-draft",
  "editor-review",
  "approved",
  "published",
  "archived",
] as const;

export type TopicContentStatus = (typeof TOPIC_CONTENT_STATUSES)[number];

export const TOPIC_CONTENT_STATUS_LABELS: Record<TopicContentStatus, string> = {
  "ai-draft": "AI draft",
  "editor-review": "Editor review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

/** The only status a student may be shown (§28). */
export const STUDENT_VISIBLE_CONTENT_STATUS: TopicContentStatus = "published";

const CONTENT_FORWARD: Record<TopicContentStatus, TopicContentStatus[]> = {
  "ai-draft": ["editor-review", "archived"],
  "editor-review": ["approved", "ai-draft", "archived"],
  approved: ["published", "editor-review", "archived"],
  published: ["archived", "approved"],
  archived: ["ai-draft"],
};

export function canTransitionContent(
  from: TopicContentStatus,
  to: TopicContentStatus
): boolean {
  return CONTENT_FORWARD[from]?.includes(to) ?? false;
}

// ── Progress (§24) ────────────────────────────────────────────────────────

export const PROGRESS_STATUSES = ["not_started", "in_progress", "completed"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

/**
 * What a student has to actually *do* to be counted as having learned a topic,
 * and what each action is worth.
 *
 * §24 is explicit that progress must not be a page visit. These are the
 * meaningful actions: opening the topic is worth nothing on its own, reading
 * the basic explanation is worth something, and the practical section, a
 * deeper explanation and a self-check each add to it. The weights sum to 100
 * so the percentage is the sum of what was done rather than a separate
 * calculation that can disagree with the flags it is derived from.
 */
export const PROGRESS_WEIGHTS = {
  basicViewed: 35,
  practicalViewed: 25,
  advancedViewed: 20,
  checkAttempted: 10,
  questionAsked: 10,
} as const;

export type ProgressSignal = keyof typeof PROGRESS_WEIGHTS;

export const PROGRESS_SIGNALS = Object.keys(PROGRESS_WEIGHTS) as ProgressSignal[];

export function isProgressSignal(value: unknown): value is ProgressSignal {
  return typeof value === "string" && (PROGRESS_SIGNALS as string[]).includes(value);
}

/** At or above this, a topic is complete without the student saying so. */
export const AUTO_COMPLETE_AT = 80;

/**
 * The percentage implied by a set of signals.
 *
 * Derived, never stored as the source of truth: a stored percentage and a set
 * of flags will disagree the first time a weight changes, and the flags are the
 * facts.
 */
export function percentageFor(signals: Partial<Record<ProgressSignal, boolean>>): number {
  let total = 0;
  for (const signal of PROGRESS_SIGNALS) {
    if (signals[signal]) total += PROGRESS_WEIGHTS[signal];
  }
  return Math.min(100, total);
}

// ── Learning events (§25) ─────────────────────────────────────────────────

/**
 * The analytics stream.
 *
 * A closed list because these are written by the client and an open one would
 * let a browser define the platform's own metric vocabulary — "most studied
 * topics" would then be aggregating whatever names happened to be sent.
 */
export const LEARNING_EVENT_TYPES = [
  "TOPIC_OPENED",
  "BASIC_VIEWED",
  "PRACTICAL_VIEWED",
  "ADVANCED_REQUESTED",
  "CHECK_ATTEMPTED",
  "AI_QUESTION_ASKED",
  "AI_ANSWER_VIEWED",
  "AI_ANSWER_REGENERATED",
  "TOPIC_COMPLETED",
  "TOPIC_BOOKMARKED",
  "PRACTICE_STARTED",
  "PRACTICE_COMPLETED",
] as const;

export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

export function isLearningEventType(value: unknown): value is LearningEventType {
  return typeof value === "string" && (LEARNING_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Which progress signal an event implies, where it implies one.
 *
 * The mapping lives here so the events endpoint and the progress endpoint agree
 * on what "the student read the practical section" means. Events with no entry
 * are recorded for analytics and move no needle — `TOPIC_OPENED` above all,
 * which is exactly the page visit §24 forbids counting.
 */
export const EVENT_PROGRESS_SIGNAL: Partial<Record<LearningEventType, ProgressSignal>> = {
  BASIC_VIEWED: "basicViewed",
  PRACTICAL_VIEWED: "practicalViewed",
  ADVANCED_REQUESTED: "advancedViewed",
  CHECK_ATTEMPTED: "checkAttempted",
  AI_QUESTION_ASKED: "questionAsked",
};

// ── Follow-up actions (§16, §39) ──────────────────────────────────────────

/**
 * The quick actions under an answer, and the question each one actually sends.
 *
 * The *text* is here, on the server, and the client sends only the key. Two
 * reasons: the phrasing is part of the prompt surface and §35 keeps that
 * server-side, and a fixed set of question strings is what makes the answer
 * cache (§17) hit at all — free text from eight different students never
 * normalises to the same key, but "show-code" always does.
 */
export const FOLLOW_UP_ACTIONS = [
  "simpler",
  "example",
  "deeper",
  "code",
  "real-world",
  "compare",
  "interview",
  "practice",
] as const;

export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];

export type FollowUpMeta = {
  key: FollowUpAction;
  label: string;
  /** The question sent to the tutor, with the topic title interpolated. */
  question: (topicTitle: string) => string;
  /** Overrides the conversation's depth where the action implies one. */
  depth?: DepthLevel;
};

export const FOLLOW_UPS: FollowUpMeta[] = [
  {
    key: "simpler",
    label: "Explain more simply",
    question: (topic) => `Explain ${topic} more simply, as if I am seeing it for the first time.`,
    depth: "basic",
  },
  {
    key: "example",
    label: "Give an example",
    question: (topic) => `Give me a worked example of ${topic}, step by step.`,
    depth: "practical",
  },
  {
    key: "deeper",
    label: "Explain in depth",
    question: (topic) => `Explain ${topic} in more technical depth.`,
    depth: "advanced",
  },
  {
    key: "code",
    label: "Show code",
    question: (topic) =>
      `Show me code for ${topic} and explain it line by line, including what it outputs.`,
    depth: "practical",
  },
  {
    key: "real-world",
    label: "Real-world use",
    question: (topic) => `Where is ${topic} actually used in industry? Give concrete cases.`,
    depth: "practical",
  },
  {
    key: "compare",
    label: "Compare with related ideas",
    question: (topic) =>
      `Compare ${topic} with the concepts it is most often confused with, and say when each is used.`,
    depth: "intermediate",
  },
  {
    key: "interview",
    label: "Interview questions",
    question: (topic) =>
      `What interview questions are asked on ${topic}? Give the questions and how to answer them.`,
    depth: "intermediate",
  },
  {
    key: "practice",
    label: "Practice problems",
    question: (topic) =>
      `Give me practice problems on ${topic}, from easy to hard, with the approach for each.`,
    depth: "intermediate",
  },
];

const FOLLOW_UP_MAP = new Map(FOLLOW_UPS.map((entry) => [entry.key, entry]));

export function followUp(key: string): FollowUpMeta | null {
  return FOLLOW_UP_MAP.get(key as FollowUpAction) ?? null;
}

// ── Bookmarks (§41) ───────────────────────────────────────────────────────

export const BOOKMARK_TYPES = ["topic", "subject", "answer"] as const;
export type BookmarkType = (typeof BOOKMARK_TYPES)[number];
