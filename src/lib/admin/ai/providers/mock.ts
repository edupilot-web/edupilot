import {
  type AIProvider,
  type ProviderMessage,
  type ProviderOptions,
  type ProviderResult,
} from "@/lib/admin/ai/provider";

/**
 * The mock provider (spec §45 phase 1).
 *
 * Not a stub that returns lorem ipsum. It reads the syllabus out of the system
 * prompt it was handed and builds a schema-valid document from the *actual* unit
 * titles and topics, so the whole pipeline — validation, grounding checks,
 * versioning, the editor, the outline tree — can be exercised end to end before
 * any provider key exists, and so a failure in those stages is a real failure
 * rather than an artefact of fake input.
 *
 * It is also the default provider. A deployment with no `GEMINI_API_KEY`
 * generates plausible, clearly-marked placeholder content instead of erroring,
 * which is what makes local development and tests possible.
 *
 * Every passage it writes says it is placeholder text. That is deliberate: §42
 * forbids presenting generated content as authoritative, and mock content that
 * read like real content would eventually be reviewed and published by someone
 * who could not tell.
 */
export class MockProvider implements AIProvider {
  readonly type = "mock" as const;
  readonly name = "Mock provider";

  isConfigured(): boolean {
    return true;
  }

  async validate(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "The mock provider needs no configuration." };
  }

  async generate(messages: ProviderMessage, options: ProviderOptions): Promise<ProviderResult> {
    const started = Date.now();
    await this.think();
    const text = `_Placeholder assistant output from the mock provider._\n\nThe requested revision would go here. Configure a real provider in AI Settings to get actual content.`;
    return this.result(text, messages, options, started);
  }

  async generateStructured(
    messages: ProviderMessage,
    options: ProviderOptions
  ): Promise<ProviderResult> {
    const started = Date.now();
    await this.think();

    const syllabus = parseSyllabus(messages.system);
    const contentType = parseContentType(messages.system);
    const subject = parseField(messages.system, "Subject") ?? "this subject";
    const restrictedUnit = parseRestrictedUnit(messages.system);

    const units = restrictedUnit
      ? syllabus.filter((unit) => unit.unitNumber === restrictedUnit)
      : syllabus;

    const payload = build(contentType, subject, units.length ? units : syllabus, syllabus);

    return this.result(JSON.stringify(payload), messages, options, started);
  }

  /** A short delay, so asynchronous job handling is actually exercised. */
  private async think(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  private result(
    text: string,
    messages: ProviderMessage,
    options: ProviderOptions,
    started: number
  ): ProviderResult {
    // Roughly four characters per token. An estimate, and labelled as one
    // wherever it surfaces — the mock has no real accounting to report.
    const promptTokens = Math.ceil((messages.system.length + messages.user.length) / 4);
    const completionTokens = Math.ceil(text.length / 4);

    return {
      text,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      model: options.model || "mock-1",
      durationMs: Date.now() - started,
    };
  }
}

// ── Reading the prompt back ──────────────────────────────────────────────

type ParsedUnit = { unitNumber: number; title: string; topics: string[] };

/**
 * Recover the syllabus from the rendered prompt.
 *
 * The mock deliberately does not receive the context object: it goes through the
 * exact same interface a real provider does, so anything it can ground on is
 * something a real provider could also ground on. If the prompt failed to carry
 * the syllabus, the mock's output would be visibly ungrounded too — which is a
 * useful property, not a limitation.
 */
function parseSyllabus(system: string): ParsedUnit[] {
  const units: ParsedUnit[] = [];
  const pattern = /^Unit (\d+): (.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(system)) !== null) {
    const unitNumber = Number(match[1]);
    if (units.some((unit) => unit.unitNumber === unitNumber)) continue;

    // Topics are on a "  Topics: a; b; c" line inside the same unit block.
    const after = system.slice(match.index, match.index + 1200);
    const topicsLine = /^\s+Topics: (.+)$/m.exec(after);
    const topics = topicsLine
      ? topicsLine[1].split(";").map((topic) => topic.trim()).filter(Boolean)
      : [];

    units.push({ unitNumber, title: match[2].trim(), topics });
  }

  return units.sort((a, b) => a.unitNumber - b.unitNumber);
}

function parseField(system: string, label: string): string | null {
  const match = new RegExp(`^${label}: (.+)$`, "m").exec(system);
  return match ? match[1].trim() : null;
}

function parseContentType(system: string): string {
  const match = /^Generate: (.+)\.$/m.exec(system);
  return match ? match[1].trim() : "Complete Course";
}

function parseRestrictedUnit(system: string): number | null {
  const match = /Restrict this entirely to Unit (\d+)/.exec(system);
  return match ? Number(match[1]) : null;
}

// ── Building each content shape ─────────────────────────────────────────

const NOTE = "Placeholder text generated by the mock AI provider. It is not academic content and must not be published.";

function envelope(covered: ParsedUnit[]) {
  return {
    syllabusUnitsCovered: covered.map((unit) => unit.unitNumber),
    unavailable: [
      {
        field: "content",
        reason: "The mock provider does not produce academic content. Configure a real provider in AI Settings.",
      },
    ],
    reviewerNotes: NOTE,
  };
}

function topicsFor(unit: ParsedUnit): string[] {
  return unit.topics.length ? unit.topics : [unit.title];
}

function buildTopics(unit: ParsedUnit) {
  return topicsFor(unit).map((topic, index) => ({
    topicNumber: index + 1,
    title: topic,
    content: `${NOTE}\n\nThis topic belongs to Unit ${unit.unitNumber} (${unit.title}) of the syllabus on record. A real provider would explain "${topic}" here at the requested level, length and difficulty.`,
    keyPoints: [`"${topic}" is listed under Unit ${unit.unitNumber} of the syllabus.`],
    examples: [
      {
        title: `Example for ${topic}`,
        body: NOTE,
        language: null,
      },
    ],
    importantTerms: [{ term: topic, definition: NOTE }],
  }));
}

function buildUnits(units: ParsedUnit[]) {
  return units.map((unit) => ({
    unitNumber: unit.unitNumber,
    title: unit.title,
    description: `${NOTE} Unit ${unit.unitNumber} of the syllabus on record.`,
    learningObjectives: topicsFor(unit)
      .slice(0, 4)
      .map((topic) => `Understand ${topic}.`),
    topics: buildTopics(unit),
  }));
}

function overview(subject: string, all: ParsedUnit[]) {
  return {
    title: subject,
    description: `${NOTE}\n\nThis subject has ${all.length} unit${all.length === 1 ? "" : "s"} on record: ${all.map((unit) => unit.title).join(", ")}.`,
    prerequisites: [],
    learningObjectives: all.map((unit) => `Understand the material of Unit ${unit.unitNumber}: ${unit.title}.`),
    relevance: null,
  };
}

function questions(units: ParsedUnit[], perUnit: number, marks: number | null) {
  return units.flatMap((unit) =>
    topicsFor(unit)
      .slice(0, perUnit)
      .map((topic) => ({
        question: `Explain ${topic}. (Unit ${unit.unitNumber})`,
        answer: NOTE,
        marks,
        unitNumber: unit.unitNumber,
        difficulty: "moderate" as const,
      }))
  );
}

function notes(units: ParsedUnit[]) {
  return units.map((unit) => ({
    title: `Unit ${unit.unitNumber}: ${unit.title}`,
    unitNumber: unit.unitNumber,
    topicNumber: null,
    sections: topicsFor(unit).map((topic) => ({ heading: topic, body: NOTE })),
    keyConcepts: topicsFor(unit).slice(0, 5).map((topic) => ({ term: topic, definition: NOTE })),
    examples: [],
    summary: NOTE,
  }));
}

/**
 * Dispatch on the content type's *label*, since that is what the prompt carries.
 *
 * The default is the complete-course shape: a mock that returned nothing for an
 * unrecognised type would make a new content type look broken when it is only
 * unmocked.
 */
function build(contentTypeLabel: string, subject: string, units: ParsedUnit[], all: ParsedUnit[]): unknown {
  const type = contentTypeLabel.toLowerCase();

  if (type.includes("course overview")) {
    return { courseOverview: overview(subject, all), ...envelope(all) };
  }

  if (type.includes("learning objectives")) {
    return {
      learningObjectives: all.map((unit) => `Understand Unit ${unit.unitNumber}: ${unit.title}.`),
      outcomes: all.map((unit) => `Apply the concepts of ${unit.title}.`),
      ...envelope(all),
    };
  }

  if (type.includes("unit structure")) {
    return {
      units: all.map((unit) => ({
        unitNumber: unit.unitNumber,
        title: unit.title,
        description: NOTE,
        learningObjectives: topicsFor(unit).slice(0, 3).map((topic) => `Understand ${topic}.`),
        topics: topicsFor(unit).map((topic, index) => ({ topicNumber: index + 1, title: topic })),
      })),
      ...envelope(all),
    };
  }

  if (type.includes("unit content")) return { units: buildUnits(units), ...envelope(units) };

  if (type.includes("lesson content")) {
    return { lessons: notes(units), ...envelope(units) };
  }

  if (type.includes("study notes") || type.includes("revision notes") || type.includes("previous-topic")) {
    return { notes: notes(units), ...envelope(units) };
  }

  if (type.includes("mcq")) {
    return {
      mcqs: units.flatMap((unit) =>
        topicsFor(unit).slice(0, 3).map((topic) => ({
          question: `Which statement about ${topic} is correct? (Unit ${unit.unitNumber})`,
          options: ["Placeholder option A", "Placeholder option B", "Placeholder option C", "Placeholder option D"],
          answerIndex: 0,
          explanation: NOTE,
          unitNumber: unit.unitNumber,
          difficulty: "moderate" as const,
        }))
      ),
      ...envelope(units),
    };
  }

  if (type.includes("question bank")) {
    return {
      mcqs: units.flatMap((unit) =>
        topicsFor(unit).slice(0, 2).map((topic) => ({
          question: `Which statement about ${topic} is correct?`,
          options: ["Placeholder A", "Placeholder B", "Placeholder C", "Placeholder D"],
          answerIndex: 0,
          explanation: NOTE,
          unitNumber: unit.unitNumber,
          difficulty: "moderate" as const,
        }))
      ),
      shortAnswers: questions(units, 2, 5),
      longAnswers: questions(units, 1, 10),
      ...envelope(units),
    };
  }

  if (type.includes("short answer")) return { questions: questions(units, 3, 5), ...envelope(units) };
  if (type.includes("long answer")) return { questions: questions(units, 2, 10), ...envelope(units) };
  if (type.includes("important questions")) return { questions: questions(units, 2, 5), ...envelope(units) };
  if (type.includes("interview") || type.includes("viva")) {
    return { questions: questions(units, 2, null), ...envelope(units) };
  }

  if (type.includes("flashcard")) {
    return {
      flashcards: units.flatMap((unit) =>
        topicsFor(unit).map((topic) => ({ front: `What is ${topic}?`, back: NOTE, unitNumber: unit.unitNumber }))
      ),
      ...envelope(units),
    };
  }

  if (type.includes("summary")) {
    return {
      summary: `${NOTE}\n\n${subject} covers ${all.length} units.`,
      keyTakeaways: all.map((unit) => `Unit ${unit.unitNumber}: ${unit.title}`),
      ...envelope(all),
    };
  }

  if (type.includes("lab") || type.includes("practical")) {
    return {
      experiments: units.map((unit, index) => ({
        experimentNumber: index + 1,
        title: `Experiment on ${unit.title}`,
        aim: NOTE,
        requirements: [],
        procedure: [NOTE],
        expectedResult: null,
        vivaQuestions: [`What is ${unit.title}?`],
      })),
      ...envelope(units),
    };
  }

  if (type.includes("assignment")) {
    return {
      assignments: units.map((unit) => ({
        title: `Assignment on ${unit.title}`,
        task: NOTE,
        markingGuidance: null,
        marks: 10,
        unitNumber: unit.unitNumber,
      })),
      ...envelope(units),
    };
  }

  if (type.includes("case stud")) {
    return {
      caseStudies: units.map((unit) => ({
        title: `Case study: ${unit.title}`,
        scenario: NOTE,
        discussionPoints: topicsFor(unit).slice(0, 3),
        suggestedApproach: null,
        unitNumber: unit.unitNumber,
      })),
      ...envelope(units),
    };
  }

  if (type.includes("exam preparation")) {
    return {
      strategy: NOTE,
      unitPriorities: all.map((unit) => ({
        unitNumber: unit.unitNumber,
        title: unit.title,
        weightage: null,
        focusAreas: topicsFor(unit).slice(0, 3),
      })),
      ...envelope(all),
    };
  }

  if (type.includes("custom")) {
    return {
      title: `Custom content for ${subject}`,
      sections: all.map((unit) => ({ heading: `Unit ${unit.unitNumber}: ${unit.title}`, body: NOTE })),
      ...envelope(all),
    };
  }

  // Complete course, and anything not specifically mocked.
  return { courseOverview: overview(subject, all), units: buildUnits(units), ...envelope(units) };
}
