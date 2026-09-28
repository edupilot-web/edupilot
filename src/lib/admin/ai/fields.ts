/**
 * The AI course-content vocabulary: content types, statuses, generation options.
 *
 * Plain data with no imports, so the models, the API routes, the prompt builder
 * and the screens all read one list. This file is the reason a content type can
 * be added without touching a schema enum, a dropdown and a validator
 * separately — the three would drift on the first addition.
 *
 * Mirrors the way `institution-fields.ts` serves the college module.
 */

// ── Content types (spec §7) ────────────────────────────────────────────────

/**
 * What the administrator can ask for.
 *
 * `complete-course` is the composite: it generates the overview, the unit
 * structure and every unit's content in one job. The rest are the pieces, so a
 * missing section can be filled without regenerating the whole subject (§28).
 */
export const AI_CONTENT_TYPES = [
  "complete-course",
  "course-overview",
  "learning-objectives",
  "unit-structure",
  "unit-content",
  "lesson-content",
  "study-notes",
  "important-questions",
  "question-bank",
  "mcqs",
  "short-answers",
  "long-answers",
  "flashcards",
  "revision-notes",
  "summary",
  "lab-guidance",
  "assignments",
  "case-studies",
  "interview-questions",
  "viva-questions",
  "exam-preparation",
  "previous-topic-revision",
  "custom",
] as const;

export type AiContentType = (typeof AI_CONTENT_TYPES)[number];

export type AiContentTypeMeta = {
  key: AiContentType;
  label: string;
  /** One line on the selection card. */
  blurb: string;
  /** Grouping for the card grid. */
  group: "course" | "study" | "assessment" | "practice";
  /** Composite types fan out into several sections in one job. */
  composite?: boolean;
  /** Needs a unit or topic to be chosen before it means anything. */
  scope?: "course" | "unit" | "topic";
};

export const AI_CONTENT_TYPE_META: AiContentTypeMeta[] = [
  { key: "complete-course", label: "Complete Course", blurb: "Overview, units and all unit content in one pass.", group: "course", composite: true, scope: "course" },
  { key: "course-overview", label: "Course Overview", blurb: "Description, prerequisites and what the subject covers.", group: "course", scope: "course" },
  { key: "learning-objectives", label: "Learning Objectives", blurb: "What a student should be able to do by the end.", group: "course", scope: "course" },
  { key: "unit-structure", label: "Unit Structure", blurb: "The units and their topics, taken from the syllabus.", group: "course", scope: "course" },
  { key: "unit-content", label: "Unit Content", blurb: "Full explanation of every topic in one unit.", group: "course", scope: "unit" },
  { key: "lesson-content", label: "Lesson Content", blurb: "A teachable lesson for a single topic.", group: "course", scope: "topic" },

  { key: "study-notes", label: "Study Notes", blurb: "Condensed notes a student can revise from.", group: "study", scope: "unit" },
  { key: "revision-notes", label: "Revision Notes", blurb: "Last-mile notes for the days before an exam.", group: "study", scope: "unit" },
  { key: "summary", label: "Summary", blurb: "A short summary of the unit or the subject.", group: "study", scope: "unit" },
  { key: "flashcards", label: "Flashcards", blurb: "Front/back cards for recall practice.", group: "study", scope: "unit" },
  { key: "previous-topic-revision", label: "Previous-topic Revision", blurb: "A recap of what the topic builds on.", group: "study", scope: "topic" },

  { key: "important-questions", label: "Important Questions", blurb: "The questions most likely to be asked.", group: "assessment", scope: "unit" },
  { key: "question-bank", label: "Question Bank", blurb: "A broad bank across every unit.", group: "assessment", composite: true, scope: "course" },
  { key: "mcqs", label: "MCQs", blurb: "Multiple choice, with the answer and why.", group: "assessment", scope: "unit" },
  { key: "short-answers", label: "Short Answer Questions", blurb: "Two-to-five mark questions and model answers.", group: "assessment", scope: "unit" },
  { key: "long-answers", label: "Long Answer Questions", blurb: "Essay-length questions and model answers.", group: "assessment", scope: "unit" },
  { key: "exam-preparation", label: "Exam Preparation", blurb: "What to study, in what order, with weightage.", group: "assessment", scope: "course" },

  { key: "lab-guidance", label: "Practical / Lab Guidance", blurb: "Aim, procedure and expected result per experiment.", group: "practice", scope: "unit" },
  { key: "assignments", label: "Assignments", blurb: "Assignment tasks with marking guidance.", group: "practice", scope: "unit" },
  { key: "case-studies", label: "Case Studies", blurb: "Applied scenarios with discussion points.", group: "practice", scope: "unit" },
  { key: "interview-questions", label: "Interview Questions", blurb: "What a recruiter asks on this subject.", group: "practice", scope: "course" },
  { key: "viva-questions", label: "Viva Questions", blurb: "Oral examination questions and answers.", group: "practice", scope: "unit" },
  { key: "custom", label: "Custom Content", blurb: "Your own instruction, grounded in the same syllabus.", group: "practice", scope: "course" },
];

const CONTENT_TYPE_MAP = new Map(AI_CONTENT_TYPE_META.map((entry) => [entry.key, entry]));

export function contentTypeMeta(type: string): AiContentTypeMeta | null {
  return CONTENT_TYPE_MAP.get(type as AiContentType) ?? null;
}

export function contentTypeLabel(type: string): string {
  return CONTENT_TYPE_MAP.get(type as AiContentType)?.label ?? type;
}

export const AI_CONTENT_TYPE_GROUPS: { key: AiContentTypeMeta["group"]; label: string; blurb: string }[] = [
  { key: "course", label: "Course structure", blurb: "The spine of the subject." },
  { key: "study", label: "Study material", blurb: "What a student reads to learn." },
  { key: "assessment", label: "Assessment", blurb: "Questions and exam preparation." },
  { key: "practice", label: "Practice & applied", blurb: "Labs, assignments and interviews." },
];

// ── Content status (spec §18) ─────────────────────────────────────────────

export const AI_CONTENT_STATUSES = [
  "draft",
  "generating",
  "generated",
  "under-review",
  "approved",
  "published",
  "archived",
  "failed",
] as const;

export type AiContentStatus = (typeof AI_CONTENT_STATUSES)[number];

export const AI_CONTENT_STATUS_LABELS: Record<AiContentStatus, string> = {
  draft: "Draft",
  generating: "Generating",
  generated: "Generated",
  "under-review": "Under Review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
  failed: "Failed",
};

/**
 * The forward path (§18). Backward moves are allowed but are not listed here —
 * `canTransition` permits any move to an earlier stage, because an administrator
 * who has spotted a problem in approved content must be able to send it back.
 */
const FORWARD: Record<AiContentStatus, AiContentStatus[]> = {
  draft: ["generating", "archived"],
  generating: ["generated", "failed"],
  generated: ["under-review", "draft", "archived"],
  "under-review": ["approved", "generated", "draft", "archived"],
  approved: ["published", "under-review", "archived"],
  published: ["archived", "approved"],
  archived: ["draft"],
  failed: ["draft", "generating", "archived"],
};

export function nextStatuses(from: AiContentStatus): AiContentStatus[] {
  return FORWARD[from] ?? [];
}

export function canTransition(from: AiContentStatus, to: AiContentStatus): boolean {
  return FORWARD[from]?.includes(to) ?? false;
}

/** Statuses whose content must not be edited in place (§17). */
export const IMMUTABLE_STATUSES: readonly AiContentStatus[] = ["published"];

// ── Generation job status (spec §19) ──────────────────────────────────────

export const AI_JOB_STATUSES = ["queued", "processing", "completed", "failed", "cancelled"] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const AI_JOB_STATUS_LABELS: Record<AiJobStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** A job in one of these is finished and will not change on its own. */
export const TERMINAL_JOB_STATUSES: readonly AiJobStatus[] = ["completed", "failed", "cancelled"];

// ── Generation configuration (spec §8) ───────────────────────────────────

export const AI_CONTENT_LEVELS = ["beginner", "intermediate", "advanced", "undergraduate"] as const;
export type AiContentLevel = (typeof AI_CONTENT_LEVELS)[number];
export const AI_CONTENT_LEVEL_LABELS: Record<AiContentLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  undergraduate: "Undergraduate",
};

export const AI_LANGUAGES = ["english", "telugu", "hindi", "other"] as const;
export type AiLanguage = (typeof AI_LANGUAGES)[number];
export const AI_LANGUAGE_LABELS: Record<AiLanguage, string> = {
  english: "English",
  telugu: "Telugu",
  hindi: "Hindi",
  other: "Other",
};

export const AI_CONTENT_LENGTHS = ["short", "standard", "detailed", "comprehensive"] as const;
export type AiContentLength = (typeof AI_CONTENT_LENGTHS)[number];
export const AI_CONTENT_LENGTH_LABELS: Record<AiContentLength, string> = {
  short: "Short",
  standard: "Standard",
  detailed: "Detailed",
  comprehensive: "Comprehensive",
};

export const AI_DIFFICULTIES = ["easy", "moderate", "difficult", "mixed"] as const;
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];
export const AI_DIFFICULTY_LABELS: Record<AiDifficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  difficult: "Difficult",
  mixed: "Mixed",
};

/** Several may apply at once — "Academic + Exam-oriented" is a normal ask (§8). */
export const AI_TEACHING_STYLES = [
  "academic",
  "simple",
  "exam-oriented",
  "concept-first",
  "practical",
  "interview-oriented",
] as const;
export type AiTeachingStyle = (typeof AI_TEACHING_STYLES)[number];
export const AI_TEACHING_STYLE_LABELS: Record<AiTeachingStyle, string> = {
  academic: "Academic",
  simple: "Simple explanation",
  "exam-oriented": "Exam-oriented",
  "concept-first": "Concept-first",
  practical: "Practical",
  "interview-oriented": "Interview-oriented",
};

/** How each style is described *to the model* (§11 rule 12). */
export const AI_TEACHING_STYLE_DIRECTIONS: Record<AiTeachingStyle, string> = {
  academic: "Use precise academic register and standard textbook structure.",
  simple: "Explain in plain language first, then introduce the formal terms.",
  "exam-oriented": "Emphasise what is examinable: definitions, comparisons and marked answers.",
  "concept-first": "Build the underlying concept before any syntax, formula or procedure.",
  practical: "Lead with worked examples and where the idea is actually used.",
  "interview-oriented": "Frame explanations the way a candidate would need to answer them aloud.",
};

// ── Content sources (spec §9) ────────────────────────────────────────────

export const AI_SOURCE_TYPES = [
  "syllabus",
  "pdf",
  "notes",
  "reference-book",
  "admin-instructions",
  "existing-content",
] as const;
export type AiSourceType = (typeof AI_SOURCE_TYPES)[number];
export const AI_SOURCE_TYPE_LABELS: Record<AiSourceType, string> = {
  syllabus: "Existing syllabus",
  pdf: "Uploaded PDF",
  notes: "Uploaded notes",
  "reference-book": "Reference books",
  "admin-instructions": "Admin instructions",
  "existing-content": "Existing generated content",
};

/** Upload formats the extractor accepts (§9). */
export const AI_SOURCE_MIME_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain": "TXT",
  "text/markdown": "Markdown",
};

// ── Providers (spec §23, §24) ────────────────────────────────────────────

/**
 * `deepseek`, `groq` and `openai` are listed separately even though all three
 * are served by one `OpenAICompatibleProvider` class. They are separate *here*
 * because this list is what a stored document, a routing environment variable
 * and the usage dashboard all name — and "which provider answered" has to be
 * answerable as "DeepSeek", not as "one of the OpenAI-compatible ones".
 *
 * `vertex` and `gemini` are the same reasoning again: both call Gemini models
 * over the same wire format, but one authenticates with a Google Cloud service
 * account and the other with an API key. They bill differently, fail
 * differently and are configured differently, so a usage dashboard that
 * collapsed them into "Google" would be unable to answer why the bill moved.
 */
export const AI_PROVIDER_TYPES = [
  "mock",
  "vertex",
  "gemini",
  "ollama",
  "openai-compatible",
  "anthropic",
  "deepseek",
  "groq",
  "openai",
] as const;
export type AiProviderType = (typeof AI_PROVIDER_TYPES)[number];
export const AI_PROVIDER_TYPE_LABELS: Record<AiProviderType, string> = {
  mock: "Mock (no external calls)",
  vertex: "Google Vertex AI",
  gemini: "Google Gemini (API key)",
  ollama: "Ollama (local)",
  "openai-compatible": "OpenAI-compatible",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  groq: "Groq",
  openai: "OpenAI",
};

// ── AI assistant actions (spec §14, §15) ─────────────────────────────────

export const AI_ASSIST_ACTIONS = [
  "improve",
  "simplify",
  "expand",
  "summarize",
  "generate-example",
  "generate-quiz",
  "generate-questions",
  "generate-flashcards",
  "rewrite",
  "fix-accuracy",
  "change-difficulty",
  "translate",
  "regenerate",
] as const;
export type AiAssistAction = (typeof AI_ASSIST_ACTIONS)[number];

export const AI_ASSIST_ACTION_LABELS: Record<AiAssistAction, string> = {
  improve: "Improve",
  simplify: "Simplify",
  expand: "Expand",
  summarize: "Summarize",
  "generate-example": "Generate Example",
  "generate-quiz": "Generate Quiz",
  "generate-questions": "Generate Questions",
  "generate-flashcards": "Generate Flashcards",
  rewrite: "Rewrite",
  "fix-accuracy": "Fix Accuracy",
  "change-difficulty": "Change Difficulty",
  translate: "Translate",
  regenerate: "Regenerate",
};

/**
 * How the assistant's output may be applied (§15).
 *
 * `discard` is listed because it is a real outcome an administrator chooses, not
 * the absence of one — and because nothing here may overwrite silently.
 */
export const AI_ASSIST_APPLY_MODES = ["insert", "replace", "append", "discard"] as const;
export type AiAssistApplyMode = (typeof AI_ASSIST_APPLY_MODES)[number];

// ── Regeneration (spec §16) ──────────────────────────────────────────────

export const AI_REGENERATE_MODES = ["keep-current", "new-version", "replace-current"] as const;
export type AiRegenerateMode = (typeof AI_REGENERATE_MODES)[number];
export const AI_REGENERATE_MODE_LABELS: Record<AiRegenerateMode, string> = {
  "keep-current": "Keep current version",
  "new-version": "Create new version",
  "replace-current": "Replace current version",
};
