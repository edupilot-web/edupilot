import { z } from "zod";
import { AI_CONTENT_TYPES, type AiContentType } from "@/lib/admin/ai/fields";

/**
 * The structured content contract (spec §12).
 *
 * One zod schema per content type, and a JSON Schema derived from it for the
 * providers that can constrain their own output. The zod object is the authority:
 * a provider's JSON-schema mode reduces malformed responses but does not
 * eliminate them, so every response is parsed here before it reaches the
 * database (§25).
 *
 * Content is never a blob of HTML (§44). It is a tree of named fields, which is
 * what makes §14's outline navigable, §28's partial regeneration addressable, and
 * §40's future student view possible without reshaping the database.
 *
 * **`.nullable()` rather than `.optional()` almost everywhere.** A field the
 * model could not fill must arrive as an explicit null — §11 rule 11 requires
 * missing information to be marked as unavailable rather than invented, and a
 * silently absent key is indistinguishable from a key the prompt forgot to ask
 * for.
 */

// ── Leaf shapes ──────────────────────────────────────────────────────────

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

/** Prose. Long, but bounded: an unbounded string is a denial-of-service field. */
const prose = z.string().trim().max(20000);

export const exampleSchema = z.object({
  title: nonEmpty(300),
  /** The worked example itself. Markdown, not HTML. */
  body: prose,
  /** Present for programming subjects; null for everything else. */
  language: z.string().trim().max(40).nullable().default(null),
});

export const keyConceptSchema = z.object({
  term: nonEmpty(200),
  definition: prose,
});

export const topicSchema = z.object({
  topicNumber: z.number().int().min(1).max(100),
  title: nonEmpty(300),
  content: prose,
  keyPoints: z.array(nonEmpty(600)).max(30).default([]),
  examples: z.array(exampleSchema).max(20).default([]),
  importantTerms: z.array(keyConceptSchema).max(40).default([]),
});

export const unitSchema = z.object({
  unitNumber: z.number().int().min(1).max(30),
  title: nonEmpty(300),
  description: prose.nullable().default(null),
  learningObjectives: z.array(nonEmpty(600)).max(20).default([]),
  topics: z.array(topicSchema).max(40).default([]),
});

export const courseOverviewSchema = z.object({
  title: nonEmpty(300),
  description: prose,
  prerequisites: z.array(nonEmpty(300)).max(20).default([]),
  learningObjectives: z.array(nonEmpty(600)).max(20).default([]),
  /** How the subject connects to the rest of the programme. */
  relevance: prose.nullable().default(null),
});

// ── Assessment shapes ────────────────────────────────────────────────────

export const mcqSchema = z.object({
  question: nonEmpty(2000),
  options: z.array(nonEmpty(600)).min(2).max(6),
  /** Index into `options`. An index, not the text, so it cannot drift. */
  answerIndex: z.number().int().min(0).max(5),
  explanation: prose.nullable().default(null),
  unitNumber: z.number().int().min(1).max(30).nullable().default(null),
  difficulty: z.enum(["easy", "moderate", "difficult"]).nullable().default(null),
});

export const questionSchema = z.object({
  question: nonEmpty(2000),
  /** A model answer, so a reviewer can judge the question and the answer. */
  answer: prose,
  marks: z.number().int().min(1).max(20).nullable().default(null),
  unitNumber: z.number().int().min(1).max(30).nullable().default(null),
  difficulty: z.enum(["easy", "moderate", "difficult"]).nullable().default(null),
});

export const flashcardSchema = z.object({
  front: nonEmpty(600),
  back: prose,
  unitNumber: z.number().int().min(1).max(30).nullable().default(null),
});

export const lessonSectionSchema = z.object({
  heading: nonEmpty(300),
  body: prose,
});

export const lessonSchema = z.object({
  title: nonEmpty(300),
  unitNumber: z.number().int().min(1).max(30).nullable().default(null),
  topicNumber: z.number().int().min(1).max(100).nullable().default(null),
  sections: z.array(lessonSectionSchema).max(30).default([]),
  keyConcepts: z.array(keyConceptSchema).max(40).default([]),
  examples: z.array(exampleSchema).max(20).default([]),
  summary: prose.nullable().default(null),
});

export const labExperimentSchema = z.object({
  experimentNumber: z.number().int().min(1).max(60),
  title: nonEmpty(300),
  aim: prose,
  /** Apparatus, software or prerequisites. */
  requirements: z.array(nonEmpty(300)).max(20).default([]),
  procedure: z.array(nonEmpty(2000)).max(40).default([]),
  expectedResult: prose.nullable().default(null),
  vivaQuestions: z.array(nonEmpty(600)).max(20).default([]),
});

export const caseStudySchema = z.object({
  title: nonEmpty(300),
  scenario: prose,
  discussionPoints: z.array(nonEmpty(600)).max(20).default([]),
  suggestedApproach: prose.nullable().default(null),
  unitNumber: z.number().int().min(1).max(30).nullable().default(null),
});

export const assignmentSchema = z.object({
  title: nonEmpty(300),
  task: prose,
  markingGuidance: prose.nullable().default(null),
  marks: z.number().int().min(1).max(100).nullable().default(null),
  unitNumber: z.number().int().min(1).max(30).nullable().default(null),
});

// ── The envelope ─────────────────────────────────────────────────────────

/**
 * Notes the model is *required* to use rather than fabricating (§11 rules 10–11).
 *
 * A first-class field, not a convention buried in prose. If the model cannot
 * source something, it says so here and a reviewer sees it on the screen —
 * which is the whole difference between an admission and a silent invention.
 */
const unavailableSchema = z.object({
  field: nonEmpty(200),
  reason: nonEmpty(600),
});

/**
 * Every response shares this wrapper.
 *
 * `syllabusUnitsCovered` is how §9's grounding becomes checkable: the model
 * declares which of the *supplied* unit numbers it wrote about, and the
 * validator rejects a response naming a unit the syllabus does not have.
 */
const envelope = {
  syllabusUnitsCovered: z.array(z.number().int().min(1).max(30)).max(30).default([]),
  unavailable: z.array(unavailableSchema).max(30).default([]),
  /** The model's own note to the reviewer. Never shown to a student. */
  reviewerNotes: z.string().trim().max(4000).nullable().default(null),
};

// ── Per-content-type schemas ─────────────────────────────────────────────

export const completeCourseSchema = z.object({
  courseOverview: courseOverviewSchema,
  units: z.array(unitSchema).min(1).max(30),
  ...envelope,
});

export const unitStructureSchema = z.object({
  units: z
    .array(
      z.object({
        unitNumber: z.number().int().min(1).max(30),
        title: nonEmpty(300),
        description: prose.nullable().default(null),
        learningObjectives: z.array(nonEmpty(600)).max(20).default([]),
        topics: z
          .array(z.object({ topicNumber: z.number().int().min(1).max(100), title: nonEmpty(300) }))
          .max(40)
          .default([]),
      })
    )
    .min(1)
    .max(30),
  ...envelope,
});

const listSchema = <T extends z.ZodTypeAny>(item: T, key: string, max = 200) =>
  z.object({ [key]: z.array(item).min(1).max(max), ...envelope });

/**
 * The schema registry.
 *
 * Keyed by content type so the generator, the validator and the editor all
 * resolve the same shape from the same place — a second mapping anywhere is how
 * a saved document stops matching the schema that was meant to police it.
 */
export const CONTENT_SCHEMAS = {
  "complete-course": completeCourseSchema,
  "course-overview": z.object({ courseOverview: courseOverviewSchema, ...envelope }),
  "learning-objectives": z.object({
    learningObjectives: z.array(nonEmpty(600)).min(1).max(40),
    outcomes: z.array(nonEmpty(600)).max(40).default([]),
    ...envelope,
  }),
  "unit-structure": unitStructureSchema,
  "unit-content": z.object({ units: z.array(unitSchema).min(1).max(30), ...envelope }),
  "lesson-content": z.object({ lessons: z.array(lessonSchema).min(1).max(40), ...envelope }),
  "study-notes": listSchema(lessonSchema, "notes", 40),
  "important-questions": listSchema(questionSchema, "questions"),
  "question-bank": z.object({
    mcqs: z.array(mcqSchema).max(300).default([]),
    shortAnswers: z.array(questionSchema).max(200).default([]),
    longAnswers: z.array(questionSchema).max(100).default([]),
    ...envelope,
  }),
  mcqs: listSchema(mcqSchema, "mcqs", 300),
  "short-answers": listSchema(questionSchema, "questions"),
  "long-answers": listSchema(questionSchema, "questions", 100),
  flashcards: listSchema(flashcardSchema, "flashcards", 300),
  "revision-notes": listSchema(lessonSchema, "notes", 40),
  summary: z.object({ summary: prose, keyTakeaways: z.array(nonEmpty(600)).max(40).default([]), ...envelope }),
  "lab-guidance": listSchema(labExperimentSchema, "experiments", 60),
  assignments: listSchema(assignmentSchema, "assignments", 60),
  "case-studies": listSchema(caseStudySchema, "caseStudies", 40),
  "interview-questions": listSchema(questionSchema, "questions"),
  "viva-questions": listSchema(questionSchema, "questions"),
  "exam-preparation": z.object({
    strategy: prose,
    unitPriorities: z
      .array(
        z.object({
          unitNumber: z.number().int().min(1).max(30),
          title: nonEmpty(300),
          weightage: z.string().trim().max(60).nullable().default(null),
          focusAreas: z.array(nonEmpty(600)).max(20).default([]),
        })
      )
      .max(30)
      .default([]),
    ...envelope,
  }),
  "previous-topic-revision": listSchema(lessonSchema, "notes", 20),
  custom: z.object({
    title: nonEmpty(300),
    sections: z.array(lessonSectionSchema).min(1).max(60),
    ...envelope,
  }),
} as const satisfies Record<AiContentType, z.ZodTypeAny>;

export type ContentSchemaFor<T extends AiContentType> = (typeof CONTENT_SCHEMAS)[T];

export function schemaFor(contentType: string): z.ZodTypeAny | null {
  if (!AI_CONTENT_TYPES.includes(contentType as AiContentType)) return null;
  return CONTENT_SCHEMAS[contentType as AiContentType];
}

// ── JSON Schema, for providers that constrain their own output ───────────

/**
 * A hand-written JSON Schema per content type would drift from the zod above on
 * the first edit, so it is derived instead.
 *
 * `z.toJSONSchema` emits draft 2020-12. Gemini and Ollama accept a *subset* of
 * that, so `simplifyForProvider` strips what they reject — `$schema`, `$ref`
 * indirection, `additionalProperties`, `default`, and the `anyOf: [T, null]`
 * that zod produces for a nullable — rather than sending a document the provider
 * will refuse. The zod schema still enforces the full contract on the way in;
 * this is only a hint that makes a well-formed response more likely.
 */
export function jsonSchemaFor(contentType: string): Record<string, unknown> | null {
  const schema = schemaFor(contentType);
  if (!schema) return null;

  try {
    const raw = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" });
    return simplifyForProvider(raw as Record<string, unknown>);
  } catch {
    // A schema that cannot be expressed as JSON Schema is not a reason to fail
    // generation: the provider simply gets no hint and zod still validates.
    return null;
  }
}

function simplifyForProvider(node: unknown): Record<string, unknown> {
  return walk(node) as Record<string, unknown>;
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk);
  if (!node || typeof node !== "object") return node;

  const input = node as Record<string, unknown>;

  // `anyOf: [X, {type: "null"}]` — a zod nullable. Providers reject the union,
  // so collapse it to X: the field stays present and zod still accepts null.
  if (Array.isArray(input.anyOf)) {
    const branches = input.anyOf.filter(
      (branch) => !(branch && typeof branch === "object" && (branch as Record<string, unknown>).type === "null")
    );
    if (branches.length === 1) return walk(branches[0]);
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "$schema" || key === "additionalProperties" || key === "default") continue;
    output[key] = walk(value);
  }
  return output;
}

// ── Validation entry point ──────────────────────────────────────────────

export type ParseResult =
  | { ok: true; content: unknown }
  | { ok: false; issues: string[] };

/**
 * Parse a provider response against its content type's schema (§25 step 1).
 *
 * Returns readable issues rather than throwing: a schema failure is an expected
 * outcome of talking to a language model, not an exception, and the message ends
 * up on an operator's screen and in the job's error field.
 */
export function parseContent(contentType: string, value: unknown): ParseResult {
  const schema = schemaFor(contentType);
  if (!schema) return { ok: false, issues: [`Unknown content type "${contentType}".`] };

  const result = schema.safeParse(value);
  if (result.success) return { ok: true, content: result.data };

  const issues = result.error.issues.slice(0, 12).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
  if (result.error.issues.length > 12) {
    issues.push(`…and ${result.error.issues.length - 12} more`);
  }
  return { ok: false, issues };
}
