import { z } from "zod";

/**
 * The shape every tutor answer must have (§12, §64).
 *
 * The zod object is the authority and the JSON Schema below is derived from it,
 * so the constraint sent to the provider and the check applied to its response
 * cannot drift. A provider's constrained-decode mode reduces malformed
 * responses; it does not eliminate them, and a truncated response still parses.
 *
 * Every field is `.nullable()` rather than optional. A value the model could not
 * produce must arrive as an explicit null: a silently absent key is
 * indistinguishable from one the prompt forgot to ask for, and the difference
 * matters when the UI is deciding whether to render a section or say there
 * isn't one. The same reasoning as `admin/ai/schema.ts`, for the same reason.
 */

export const tutorAnswerSchema = z.object({
  /** A short heading for the answer, used in history lists. */
  title: z.string().min(1).max(200),
  /** One or two sentences a student can read before deciding to read more. */
  summary: z.string().min(1).max(1000),
  /** The answer itself. Markdown is expected; HTML is not. */
  explanation: z.string().min(1).max(12000),

  practicalExample: z.string().max(4000).nullable(),
  /** Code, when the topic warrants it. Never fenced — the fence is the UI's job. */
  code: z.string().max(6000).nullable(),
  codeLanguage: z.string().max(40).nullable(),

  keyPoints: z.array(z.string().min(1).max(400)).max(10),
  commonMistakes: z.array(z.string().min(1).max(400)).max(8),
  relatedConcepts: z.array(z.string().min(1).max(120)).max(8),
  nextTopics: z.array(z.string().min(1).max(120)).max(6),

  difficulty: z.enum(["easy", "moderate", "difficult"]),
  depthLevel: z.enum(["basic", "practical", "intermediate", "advanced", "expert"]),

  /**
   * Set when the question was not about the supplied topic (§12 rules 11-12).
   *
   * A field rather than a refusal, because the honest answer to "is a linked
   * list like a train?" is yes-and-here-is-how, not a redirect. The note says
   * how the question relates to the syllabus; the UI shows it above the answer
   * so nothing is passed off as on-syllabus material that is not.
   */
  offTopicNote: z.string().max(400).nullable(),
});

export type TutorAnswer = z.infer<typeof tutorAnswerSchema>;

/**
 * The same contract, as JSON Schema, for providers that can constrain decoding.
 *
 * Hand-written rather than produced by a zod-to-JSON-Schema converter: the
 * generated output carries `$ref`s, `anyOf` wrappers around nullables and
 * `additionalProperties` in places Gemini's `responseSchema` rejects outright.
 * A literal object is a few lines longer and is actually accepted by the two
 * services that can use it. `tutorAnswerSchema` remains the authority; this is
 * a hint, and the test below keeps the two in step.
 */
export const TUTOR_ANSWER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    explanation: { type: "string" },
    practicalExample: { type: "string", nullable: true },
    code: { type: "string", nullable: true },
    codeLanguage: { type: "string", nullable: true },
    keyPoints: { type: "array", items: { type: "string" } },
    commonMistakes: { type: "array", items: { type: "string" } },
    relatedConcepts: { type: "array", items: { type: "string" } },
    nextTopics: { type: "array", items: { type: "string" } },
    difficulty: { type: "string", enum: ["easy", "moderate", "difficult"] },
    depthLevel: {
      type: "string",
      enum: ["basic", "practical", "intermediate", "advanced", "expert"],
    },
    offTopicNote: { type: "string", nullable: true },
  },
  required: [
    "title",
    "summary",
    "explanation",
    "keyPoints",
    "difficulty",
    "depthLevel",
  ],
};

/** Every key the schema defines — used by the test that keeps the two aligned. */
export const TUTOR_ANSWER_KEYS = Object.keys(tutorAnswerSchema.shape);

/**
 * Parse a provider's payload, tolerating the shapes models actually return.
 *
 * Two accommodations, both earned rather than defensive:
 *
 *   - a missing array becomes an empty one, because "no common mistakes worth
 *     listing" is a legitimate answer and failing the whole response over it
 *     would spend a second request to get the same content back;
 *   - a missing nullable becomes null, for the same reason.
 *
 * Nothing else is repaired. A response with no `explanation` is not an answer,
 * and returning a half-parsed one would put a blank panel in front of a student
 * with no indication that anything went wrong.
 */
export function parseTutorAnswer(
  value: unknown
): { ok: true; answer: TutorAnswer } | { ok: false; issues: string[] } {
  if (!value || typeof value !== "object") {
    return { ok: false, issues: ["The response was not a JSON object."] };
  }

  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    ...source,
    keyPoints: asStringArray(source.keyPoints),
    commonMistakes: asStringArray(source.commonMistakes),
    relatedConcepts: asStringArray(source.relatedConcepts),
    nextTopics: asStringArray(source.nextTopics),
    practicalExample: asNullableString(source.practicalExample),
    code: asNullableString(source.code),
    codeLanguage: asNullableString(source.codeLanguage),
    offTopicNote: asNullableString(source.offTopicNote),
    // Some models answer with the label rather than the key. Only these two
    // are mapped, because they are the ones the prompt's own wording invites.
    difficulty: normalizeDifficulty(source.difficulty),
  };

  const parsed = tutorAnswerSchema.safeParse(normalized);
  if (parsed.success) return { ok: true, answer: parsed.data };

  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    ),
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeDifficulty(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const lower = value.trim().toLowerCase();
  if (lower === "medium" || lower === "intermediate") return "moderate";
  if (lower === "hard" || lower === "advanced") return "difficult";
  return lower;
}

/**
 * The last resort when a model cannot produce a valid answer twice (§64).
 *
 * Deliberately says nothing academic. A fallback that guessed at content would
 * be the one piece of text in the system that reached a student without ever
 * being grounded on their syllabus.
 */
export function fallbackAnswer(topicTitle: string, depthLevel: string): TutorAnswer {
  return {
    title: `About ${topicTitle}`,
    summary: "The tutor could not produce a complete answer for this question.",
    explanation:
      "The AI tutor could not produce a complete answer this time. Your question has been saved — try asking it again, or rephrase it slightly. Nothing in your syllabus or your progress has changed.",
    practicalExample: null,
    code: null,
    codeLanguage: null,
    keyPoints: [],
    commonMistakes: [],
    relatedConcepts: [],
    nextTopics: [],
    difficulty: "moderate",
    depthLevel: (depthLevel === "curriculum" ? "basic" : depthLevel) as TutorAnswer["depthLevel"],
    offTopicNote: null,
  };
}
