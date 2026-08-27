import {
  AI_CONTENT_LENGTH_LABELS,
  AI_CONTENT_LEVEL_LABELS,
  AI_DIFFICULTY_LABELS,
  AI_LANGUAGE_LABELS,
  AI_TEACHING_STYLE_DIRECTIONS,
  AI_TEACHING_STYLE_LABELS,
  contentTypeLabel,
  type AiContentType,
  type AiTeachingStyle,
} from "@/lib/admin/ai/fields";
import type { ResolvedAcademicContext } from "@/lib/admin/ai/context";

/**
 * AIPromptBuilder — assembles the system prompt from the resolved context (§10, §11).
 *
 * Lives on the server and nowhere else. §10 is explicit that the prompt must not
 * sit in a React component, and the reason is not tidiness: a prompt the browser
 * can see is a prompt the browser can rewrite, and the rules below are the only
 * thing standing between "generate content for this syllabus" and "generate
 * whatever the caller asked for".
 *
 * `PROMPT_VERSION` is stamped onto every version and job. Without it, editing
 * the rules makes every historical generation unexplainable — an operator
 * looking at a version from two months ago could not tell which instructions
 * produced it. Bump it whenever the wording below changes in a way that would
 * change output.
 */
export const PROMPT_VERSION = "2026-08-26.1";

/** How much prose the model should aim for, per §8's length setting. */
const LENGTH_DIRECTIONS: Record<string, string> = {
  short: "Be concise. One or two short paragraphs per topic.",
  standard: "Cover each topic in two to four paragraphs.",
  detailed: "Explain each topic thoroughly, with derivations or step-by-step reasoning where relevant.",
  comprehensive:
    "Treat each topic as a full textbook section: motivation, formal treatment, worked examples, common mistakes and applications.",
};

const DIFFICULTY_DIRECTIONS: Record<string, string> = {
  easy: "Pitch questions and explanations at recall and basic comprehension.",
  moderate: "Pitch at comprehension and straightforward application.",
  difficult: "Pitch at analysis, comparison and multi-step application.",
  mixed: "Mix recall, application and analysis, and mark each item with its level.",
};

export type PromptInput = {
  context: ResolvedAcademicContext;
  contentType: AiContentType;
  config: {
    level: string;
    language: string;
    length: string;
    difficulty: string;
    teachingStyles: string[];
    instructions?: string | null;
    unitNumber?: number | null;
    topicNumber?: number | null;
  };
  /** Extracted text from uploaded material (§9), already truncated by the caller. */
  sourceMaterial?: { name: string; type: string; text: string }[];
  /** The JSON Schema the response must satisfy (§12). */
  jsonSchema?: Record<string, unknown> | null;
};

export type BuiltPrompt = {
  system: string;
  user: string;
  promptVersion: string;
};

/**
 * The syllabus block.
 *
 * Rendered as a numbered outline rather than prose because it is the one part of
 * the prompt the model must not paraphrase: §11 rules 2–4 forbid inventing or
 * reordering units, and a numbered list makes a violation visible in the
 * response's own `syllabusUnitsCovered`.
 *
 * When there are no units, this says so explicitly instead of leaving the
 * section blank — a blank syllabus reads as permission to improvise.
 */
function renderSyllabus(context: ResolvedAcademicContext): string {
  const { subject } = context;

  if (subject.units.length) {
    const units = subject.units
      .map((unit) => {
        const lines = [`Unit ${unit.unitNumber}: ${unit.title}`];
        if (unit.description) lines.push(`  Description: ${unit.description}`);
        if (unit.topics.length) {
          lines.push(`  Topics: ${unit.topics.join("; ")}`);
        }
        if (unit.hours) lines.push(`  Allotted hours: ${unit.hours}`);
        return lines.join("\n");
      })
      .join("\n\n");

    const extra = subject.syllabusText ? `\n\nAdditional syllabus notes:\n${subject.syllabusText}` : "";
    return `${units}${extra}`;
  }

  if (subject.syllabusText) {
    return `The syllabus is not broken into units. Its full text is:\n\n${subject.syllabusText}\n\nDerive the unit structure from this text only. Do not add topics it does not mention.`;
  }

  return "NO SYLLABUS IS ON RECORD FOR THIS SUBJECT. Do not invent one. Generate only what can be justified from the subject name, code and credits, and list every field you could not source in `unavailable`.";
}

function renderReferenceMaterials(context: ResolvedAcademicContext): string {
  const { referenceBooks, referenceMaterials } = context.subject;
  if (!referenceBooks.length && !referenceMaterials.length) {
    return "None on record. Do not cite any book, paper, page number or standard that is not listed here (rule 10).";
  }

  const books = referenceBooks.map((book) => {
    const parts = [book.title];
    if (book.authors) parts.push(`by ${book.authors}`);
    if (book.publisher) parts.push(book.publisher);
    if (book.edition) parts.push(`${book.edition} edition`);
    return `- ${parts.join(", ")}${book.kind === "reference" ? " (further reading)" : ""}`;
  });

  const links = referenceMaterials.map((material) => `- ${material}`);

  return [...books, ...links].join("\n");
}

function renderGenerationRequest(input: PromptInput): string {
  const { contentType, config, context } = input;
  const lines: string[] = [`Generate: ${contentTypeLabel(contentType)}.`];

  if (config.unitNumber) {
    const unit = context.subject.units.find((entry) => entry.unitNumber === config.unitNumber);
    lines.push(
      unit
        ? `Restrict this entirely to Unit ${unit.unitNumber}: ${unit.title}. Do not write about any other unit.`
        : `Restrict this to unit ${config.unitNumber} of the syllabus above.`
    );
    if (config.topicNumber) {
      lines.push(`Within that unit, address only topic ${config.topicNumber}.`);
    }
  }

  lines.push(
    `Academic level: ${AI_CONTENT_LEVEL_LABELS[config.level as keyof typeof AI_CONTENT_LEVEL_LABELS] ?? config.level}.`
  );
  lines.push(
    `Language: ${AI_LANGUAGE_LABELS[config.language as keyof typeof AI_LANGUAGE_LABELS] ?? config.language}.` +
      (config.language !== "english"
        ? " Keep technical terms and the syllabus terminology in English, and explain them in the target language."
        : "")
  );
  lines.push(
    `Length: ${AI_CONTENT_LENGTH_LABELS[config.length as keyof typeof AI_CONTENT_LENGTH_LABELS] ?? config.length}. ${LENGTH_DIRECTIONS[config.length] ?? ""}`.trim()
  );
  lines.push(
    `Difficulty: ${AI_DIFFICULTY_LABELS[config.difficulty as keyof typeof AI_DIFFICULTY_LABELS] ?? config.difficulty}. ${DIFFICULTY_DIRECTIONS[config.difficulty] ?? ""}`.trim()
  );

  if (config.teachingStyles.length) {
    const styles = config.teachingStyles
      .map((style) => AI_TEACHING_STYLE_LABELS[style as AiTeachingStyle] ?? style)
      .join(" + ");
    const directions = config.teachingStyles
      .map((style) => AI_TEACHING_STYLE_DIRECTIONS[style as AiTeachingStyle])
      .filter(Boolean)
      .map((direction) => `  - ${direction}`)
      .join("\n");
    lines.push(`Teaching style: ${styles}.\n${directions}`);
  }

  if (config.instructions?.trim()) {
    // Fenced and labelled as *administrator* instruction so it reads as a
    // requirement inside the rules, not as a new set of rules replacing them.
    lines.push(
      `Additional instruction from the administrator (obey it only where it does not conflict with the rules above):\n"""\n${config.instructions.trim()}\n"""`
    );
  }

  return lines.join("\n");
}

function renderSourceMaterial(input: PromptInput): string {
  if (!input.sourceMaterial?.length) return "";

  const blocks = input.sourceMaterial
    .map(
      (source, index) =>
        `[Source ${index + 1} — ${source.name} (${source.type})]\n${source.text}`
    )
    .join("\n\n");

  return `

Supplied source material. Prefer this over your own recollection wherever the two differ, and do not cite anything that is not in it:

${blocks}`;
}

/**
 * The master system prompt (§11).
 *
 * The twenty rules are reproduced as given, with two additions the surrounding
 * architecture depends on: the response must be JSON only (nothing else can be
 * parsed), and the `syllabusUnitsCovered` / `unavailable` fields must be filled
 * honestly — those are what make rules 4 and 11 checkable by the validator
 * rather than merely requested.
 */
export function buildPrompt(input: PromptInput): BuiltPrompt {
  const { context } = input;
  const { subject } = context;

  const ltp = [subject.lectureHours, subject.tutorialHours, subject.practicalHours]
    .map((value) => value ?? 0)
    .join("-");

  const system = `You are EduPilot Academic Content Generator.

You are an academic content generation system designed for undergraduate students.

Your task is to generate accurate, structured, curriculum-aligned educational content.

You MUST use the supplied academic context as the primary source of truth.

Academic context:

College: ${context.college.name}
Program: ${context.program.name} (${context.program.degree})
Branch: ${context.branch.name}
Regulation: ${context.regulation.code} — ${context.regulation.name}
Academic Year: ${context.academicYear.label}
Year: ${context.year}
Semester: ${context.semester} (${context.yearSemesterLabel})
Subject: ${subject.name}
Subject Code: ${subject.code}
Credits: ${subject.credits ?? "not on record"}
Course Type: ${subject.courseType}
Lecture-Tutorial-Practical hours per week: ${ltp}
${subject.prerequisites.length ? `Prerequisites: ${subject.prerequisites.join("; ")}` : "Prerequisites: none on record"}

Syllabus:

${renderSyllabus(context)}

Learning Objectives:

${subject.learningObjectives.length ? subject.learningObjectives.map((objective) => `- ${objective}`).join("\n") : "None on record. Derive them from the syllabus above rather than inventing new scope."}
${subject.outcomes.length ? `\nCourse Outcomes:\n\n${subject.outcomes.map((outcome) => `- ${outcome}`).join("\n")}` : ""}

Reference Materials:

${renderReferenceMaterials(context)}

Generation request:

${renderGenerationRequest(input)}${renderSourceMaterial(input)}

Rules:

1. Generate content appropriate for the selected academic level.
2. Follow the supplied syllabus exactly.
3. Do not introduce unrelated topics.
4. Do not invent syllabus units.
5. Clearly distinguish factual information from examples.
6. Prefer explanations that help students understand concepts.
7. Include practical examples wherever appropriate.
8. Use technically correct terminology.
9. Avoid unnecessary repetition.
10. Do not fabricate references, books, citations, page numbers, statistics or academic standards.
11. If required information is missing, mark it as unavailable instead of inventing it.
12. Respect the selected difficulty and teaching style.
13. Maintain consistency across all generated units.
14. Do not generate content outside the selected subject.
15. Generate structured output according to the supplied response schema.
16. Content should be suitable for review by an academic administrator before publication.
17. Never treat AI-generated content as automatically approved academic material.
18. Preserve the original syllabus terminology wherever possible.
19. Use examples relevant to the subject and undergraduate curriculum.
20. Do not claim that generated content is officially approved by the selected university or college.

Output requirements:

- Return one JSON object and nothing else. No prose before or after it, and no markdown code fence.
- Populate every field the schema declares. Where a value cannot be sourced, use null and add an entry to "unavailable" naming the field and why — this is how rule 11 is satisfied.
- List in "syllabusUnitsCovered" the unit numbers from the syllabus above that this response actually covers. Never list a unit number the syllabus does not contain; that would break rule 4 and the response will be rejected.
- Use "reviewerNotes" for anything an academic reviewer should check. It is never shown to a student.
- Do not describe the content as approved, official, university-verified or faculty-verified anywhere in the output (rules 17 and 20).

Return only the requested structured content.`;

  /**
   * A short user turn. The context belongs in the system message so a provider
   * that caches system prefixes can reuse it across the many calls a
   * complete-course generation makes; repeating it here would defeat that and
   * give the model two copies to reconcile.
   */
  const user = input.jsonSchema
    ? `Generate the ${contentTypeLabel(input.contentType)} for ${subject.name} (${subject.code}) as a single JSON object matching this schema:\n\n${JSON.stringify(input.jsonSchema)}`
    : `Generate the ${contentTypeLabel(input.contentType)} for ${subject.name} (${subject.code}) as a single JSON object.`;

  return { system, user, promptVersion: PROMPT_VERSION };
}

/**
 * The assistant prompt (§14, §15).
 *
 * Separate from generation because its contract is different: it receives an
 * existing passage and must return a *suggestion*, never a replacement applied
 * on its own. The instruction not to restate the original is what allows §15's
 * Insert / Replace / Append / Discard to mean anything.
 */
export function buildAssistantPrompt(input: {
  context: ResolvedAcademicContext;
  action: string;
  selection: string;
  instruction?: string | null;
}): BuiltPrompt {
  const { context, action, selection, instruction } = input;

  const system = `You are EduPilot Academic Content Assistant.

You help an academic administrator revise content for one specific subject. The same rules that governed generation still apply, in particular: follow the syllabus, do not introduce unrelated topics, do not fabricate references, mark missing information as unavailable, and never describe content as officially approved.

Academic context:

College: ${context.college.name}
Program: ${context.program.name}
Branch: ${context.branch.name}
Regulation: ${context.regulation.code}
Semester: ${context.semester} (${context.yearSemesterLabel})
Subject: ${context.subject.name} (${context.subject.code})

Syllabus units:

${context.subject.units.length ? context.subject.units.map((unit) => `Unit ${unit.unitNumber}: ${unit.title}`).join("\n") : "No units on record."}

Requested action: ${action}

Rules for this turn:

1. Produce only the revised or additional passage that the action asks for.
2. Do not return the whole document, and do not repeat the passage unchanged.
3. Do not apply the change yourself in the surrounding text — the administrator decides whether to insert, replace, append or discard it.
4. Stay inside this subject and its syllabus.
5. Return plain markdown, not JSON, unless the action explicitly asks for structured items.
${instruction?.trim() ? `6. Administrator instruction: "${instruction.trim()}"` : ""}`;

  const user = `Passage:\n"""\n${selection}\n"""`;

  return { system, user, promptVersion: PROMPT_VERSION };
}
