import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { CurriculumSubject } from "@/models/Curriculum";
import { Subtopic, Topic, TopicContent } from "@/models/Topic";
import { ProviderError, parseJsonResponse } from "@/lib/admin/ai/provider";
import { resolveAiSettings } from "@/lib/admin/ai/settings";
import type { CurrentAdmin } from "@/lib/admin/current-admin";

/**
 * The admin content tool (§45): draft the explanation a student reads on a
 * topic page.
 *
 * This is the *other* half of §9's split. The tutor answers questions live and
 * per student; this writes the prepared explanation once, in advance, so the
 * topic page needs no model call at all. One generation here removes a
 * provider call from every future visit to that topic by every student in
 * every cohort that studies it — which is the whole economics of the module.
 *
 * **Nothing here can publish.** A generation lands in `ai-draft` and there is
 * no code path from this file to `published`. §45 is explicit, and the
 * enforcement is structural rather than a flag: `writeDraft` sets the status
 * literally, and the transition endpoints are the only other writers.
 *
 * It reuses `resolveAiSettings` and the existing provider seam rather than
 * introducing a second one — the same provider an administrator enabled for
 * course content generates this, at the same temperature, with the same key
 * handling.
 */

export const TOPIC_CONTENT_PROMPT_VERSION = "TOPIC_CONTENT_V1";

// ── Schema (§64) ──────────────────────────────────────────────────────────

/**
 * What a generation must return.
 *
 * Mirrors `TopicContent`'s student-facing fields and nothing else — no status,
 * no provenance, no review metadata. A model that could emit `status` could
 * emit `"published"`, and however carefully the caller ignored it, the field
 * would exist in a payload somebody later spreads into an update.
 */
const generatedTopicContentSchema = z.object({
  basicExplanation: z.string().min(200).max(20000),
  whyItMatters: z.string().min(20).max(1200),
  realWorldAnalogy: z.string().max(2000).nullable(),
  terminology: z
    .array(z.object({ term: z.string().min(1).max(120), meaning: z.string().min(1).max(600) }))
    .max(10),
  practicalExplanation: z.string().max(20000).nullable(),
  realWorldExamples: z.array(z.string().min(1).max(400)).max(6),
  codeExample: z
    .object({
      language: z.string().max(40),
      code: z.string().min(1).max(8000),
      explanation: z.string().max(4000),
      output: z.string().max(2000).nullable(),
    })
    .nullable(),
  keyPoints: z.array(z.string().min(1).max(400)).min(3).max(10),
  commonMistakes: z.array(z.string().min(1).max(400)).max(8),
  prerequisites: z.array(z.string().min(1).max(200)).max(6),
  checkYourUnderstanding: z
    .array(
      z.object({
        question: z.string().min(5).max(600),
        answer: z.string().min(5).max(2000),
        hint: z.string().max(400).nullable(),
      })
    )
    .min(2)
    .max(5),
  advancedOverview: z.string().max(6000).nullable(),
});

export type GeneratedTopicContent = z.infer<typeof generatedTopicContentSchema>;

const TOPIC_CONTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    basicExplanation: { type: "string" },
    whyItMatters: { type: "string" },
    realWorldAnalogy: { type: "string", nullable: true },
    terminology: {
      type: "array",
      items: {
        type: "object",
        properties: { term: { type: "string" }, meaning: { type: "string" } },
        required: ["term", "meaning"],
      },
    },
    practicalExplanation: { type: "string", nullable: true },
    realWorldExamples: { type: "array", items: { type: "string" } },
    codeExample: {
      type: "object",
      nullable: true,
      properties: {
        language: { type: "string" },
        code: { type: "string" },
        explanation: { type: "string" },
        output: { type: "string", nullable: true },
      },
      required: ["language", "code", "explanation"],
    },
    keyPoints: { type: "array", items: { type: "string" } },
    commonMistakes: { type: "array", items: { type: "string" } },
    prerequisites: { type: "array", items: { type: "string" } },
    checkYourUnderstanding: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          hint: { type: "string", nullable: true },
        },
        required: ["question", "answer"],
      },
    },
    advancedOverview: { type: "string", nullable: true },
  },
  required: [
    "basicExplanation",
    "whyItMatters",
    "keyPoints",
    "checkYourUnderstanding",
  ],
};

// ── Context (§10, §26) ────────────────────────────────────────────────────

export type ResolvedTopicContext = {
  topicId: Types.ObjectId;
  topicTitle: string;
  subjectId: Types.ObjectId;
  subjectName: string;
  subjectCode: string;
  collegeName: string | null;
  regulationCode: string | null;
  branchName: string | null;
  year: number;
  semester: number;
  unitNumber: number | null;
  unitTitle: string | null;
  unitDescription: string | null;
  /** The syllabus's own topic list for the unit — the grounding (§89). */
  unitTopics: string[];
  siblingTopics: string[];
  referenceBooks: string[];
  subtopics: string[];
};

/**
 * Resolve a topic to its whole academic context, from the database.
 *
 * The request carries a topic id and nothing else. Every label the prompt uses
 * is read here, so a caller cannot supply a subject name and have content filed
 * under a curriculum it does not belong to — the same rule
 * `admin/ai/context.ts` applies to course content, for the same reason.
 */
export async function resolveTopicContext(
  topicId: string
): Promise<{ ok: true; context: ResolvedTopicContext } | { ok: false; message: string }> {
  if (!Types.ObjectId.isValid(topicId)) {
    return { ok: false, message: "That topic id is not valid." };
  }

  await connectDB();

  const topic = await Topic.findById(topicId).lean();
  if (!topic) return { ok: false, message: "That topic could not be found." };

  const subject = await CurriculumSubject.findById(topic.subjectId).lean();
  if (!subject) {
    // A topic whose subject has gone is a broken row, not a generation to
    // attempt: there is no syllabus left to ground it on.
    return { ok: false, message: "That topic's subject no longer exists." };
  }

  const unit =
    topic.unitNumber !== null && topic.unitNumber !== undefined
      ? (subject.units ?? []).find((entry) => entry.unitNumber === topic.unitNumber) ?? null
      : null;

  const [siblings, subtopics] = await Promise.all([
    Topic.find({ subjectId: subject._id, status: "published" })
      .select("title")
      .sort({ sequence: 1 })
      .limit(30)
      .lean(),
    Subtopic.find({ topicId: topic._id, status: "published" })
      .select("title")
      .sort({ sequence: 1 })
      .lean(),
  ]);

  return {
    ok: true,
    context: {
      topicId: topic._id,
      topicTitle: topic.title,
      subjectId: subject._id,
      subjectName: subject.name,
      subjectCode: subject.code,
      collegeName: subject.collegeName ?? null,
      regulationCode: subject.regulationCode ?? null,
      branchName: subject.branchName ?? null,
      year: subject.year,
      semester: subject.semester,
      unitNumber: topic.unitNumber ?? null,
      unitTitle: topic.unitTitle ?? unit?.title ?? null,
      unitDescription: unit?.description ?? null,
      unitTopics: unit?.topics ?? [],
      siblingTopics: siblings.map((entry) => entry.title),
      referenceBooks: (subject.referenceBooks ?? [])
        .slice(0, 5)
        .map((book) => (book.authors ? `${book.title} — ${book.authors}` : book.title)),
      subtopics: subtopics.map((entry) => entry.title),
    },
  };
}

// ── Prompt ────────────────────────────────────────────────────────────────

function buildPrompt(context: ResolvedTopicContext): { system: string; user: string } {
  const system = [
    "You write the prepared explanation a student reads when they open one topic of their college syllabus in EduPilot.",
    "",
    "This text is read *before* any AI conversation. It has to stand on its own, be correct, and be pitched at an undergraduate in an Indian engineering or degree college who is meeting the topic for the first time.",
    "",
    "RULES",
    "1. Write about the given topic and nothing else. Do not cover the sibling topics listed below — each has its own page.",
    "2. Start from fundamentals. Define every term before using it.",
    "3. NEVER invent syllabus content, unit numbers, exam patterns or marks weightage.",
    "4. NEVER claim this is official, university-approved, or what an examiner expects.",
    "5. Give a worked example. For a programming topic, give code and explain it.",
    "6. `commonMistakes` are the errors students actually make on this topic — not generic study advice.",
    "7. `checkYourUnderstanding` questions must be answerable from what you wrote above them, and the answer must be complete enough to mark against.",
    "8. `advancedOverview` is a short bridge to deeper material, not the deeper material itself. Three or four sentences.",
    "9. If you cannot source a field honestly, return null (or an empty array). Never fill a slot with filler.",
    "10. Prefer accuracy and brevity to length.",
    "",
    "ACADEMIC CONTEXT — the student's real curriculum. Treat it as fact.",
    context.collegeName ? `College: ${context.collegeName}` : null,
    context.branchName ? `Branch: ${context.branchName}` : null,
    context.regulationCode ? `Regulation: ${context.regulationCode}` : null,
    `Subject: ${context.subjectName} (${context.subjectCode})`,
    `Year ${context.year}, Semester ${context.semester}`,
    context.unitNumber !== null
      ? `Syllabus Unit ${context.unitNumber}: ${context.unitTitle ?? ""}`
      : null,
    context.unitDescription ? `Unit description: ${context.unitDescription}` : null,
    context.unitTopics.length
      ? `Every topic this unit covers: ${context.unitTopics.join("; ")}`
      : null,
    "",
    `THE TOPIC TO WRITE: ${context.topicTitle}`,
    context.subtopics.length ? `Its subtopics: ${context.subtopics.join("; ")}` : null,
    context.siblingTopics.length
      ? `Other topics in this subject, which you must NOT write about: ${context.siblingTopics
          .filter((title) => title !== context.topicTitle)
          .slice(0, 25)
          .join("; ")}`
      : null,
    context.referenceBooks.length
      ? `Books the syllabus prescribes: ${context.referenceBooks.join(" | ")}. You may name these. Do not cite page or chapter numbers, and do not name a book that is not on this list.`
      : null,
    "",
    "OUTPUT",
    "Reply with a single JSON object and nothing else. No prose before it, no code fence around it.",
    "`basicExplanation` and `practicalExplanation` are Markdown: paragraphs, bold, bullet lists and inline code. No HTML, and no headings above level 3.",
    "`codeExample.code` is source only, with no surrounding fence.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const user = `Write the prepared learning content for "${context.topicTitle}".`;

  return { system, user };
}

// ── Generation ────────────────────────────────────────────────────────────

export type GenerationOutcome =
  | {
      ok: true;
      contentId: string;
      provider: string;
      model: string;
      usingMock: boolean;
      /** Set when the content already existed and a new version replaced a draft. */
      replacedDraft: boolean;
    }
  | { ok: false; code: string; message: string };

/**
 * Draft the content for one topic.
 *
 * Synchronous, unlike the course-content generator's job queue, because this is
 * one section rather than a whole subject: it finishes inside a normal request
 * budget, and a job record plus polling for a fifteen-second call would be more
 * machinery than the work. Bulk generation is the caller looping — see the
 * route, which caps the batch for exactly that reason.
 */
export async function generateTopicContent(input: {
  topicId: string;
  admin: CurrentAdmin;
  /** Overwrite an existing *draft*. Never an approved or published document. */
  replaceDraft?: boolean;
}): Promise<GenerationOutcome> {
  const resolved = await resolveTopicContext(input.topicId);
  if (!resolved.ok) {
    return { ok: false, code: "context-invalid", message: resolved.message };
  }

  const context = resolved.context;

  const existing = await TopicContent.findOne({ topicId: context.topicId, language: "english" })
    .select("_id status")
    .lean();

  /**
   * Refuse rather than overwrite, unless a draft is explicitly being replaced.
   *
   * The check runs *before* the model is called, so an operator is offered the
   * choice instead of being told after a provider has been paid — the same
   * ordering §27 requires of the course-content generator.
   */
  if (existing && !input.replaceDraft) {
    return {
      ok: false,
      code: "content-exists",
      message: `This topic already has ${existing.status} content. Open it, or choose to replace the draft.`,
    };
  }
  if (existing && existing.status !== "ai-draft") {
    return {
      ok: false,
      code: "not-a-draft",
      message: `This topic's content is ${existing.status}. Send it back to draft before regenerating it.`,
    };
  }

  const settings = await resolveAiSettings();
  const prompt = buildPrompt(context);

  let text: string;
  try {
    const result = await settings.provider.generateStructured(prompt, {
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      timeoutMs: settings.timeoutMs,
      jsonSchema: TOPIC_CONTENT_JSON_SCHEMA,
    });
    text = result.text;
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.message
        : "The AI provider could not be reached. Try again.";
    return { ok: false, code: "provider-failed", message };
  }

  const parsedJson = parseJsonResponse(text);
  if (!parsedJson.ok) {
    return { ok: false, code: "invalid-response", message: parsedJson.reason };
  }

  const parsed = generatedTopicContentSchema.safeParse(parsedJson.value);
  if (!parsed.success) {
    /**
     * No retry loop here, unlike the tutor.
     *
     * An administrator is watching this one and can press the button again with
     * one click. A silent second call would double the cost of every failure
     * without the operator ever learning that the first attempt was rejected.
     */
    return {
      ok: false,
      code: "schema-invalid",
      message: `The model's response did not match the required shape: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`,
    };
  }

  const contentId = await writeDraft({
    context,
    content: parsed.data,
    provider: settings.providerType,
    model: settings.model,
    adminId: input.admin.id,
    existingId: existing ? String(existing._id) : null,
  });

  return {
    ok: true,
    contentId,
    provider: settings.providerType,
    model: settings.model,
    /**
     * Surfaced so the screen can say so. Mock content is placeholder text, and
     * a reviewer who did not know that could approve it (§36).
     */
    usingMock: settings.providerType === "mock",
    replacedDraft: Boolean(existing),
  };
}

/**
 * Write the draft.
 *
 * The one place a generated document is created, and it sets
 * `status: "ai-draft"` as a literal. There is no parameter for the status and
 * no branch that produces another one, so "nothing generated can be published"
 * is a property of the code rather than a rule somebody has to remember.
 */
async function writeDraft(input: {
  context: ResolvedTopicContext;
  content: GeneratedTopicContent;
  provider: string;
  model: string;
  adminId: string;
  existingId: string | null;
}): Promise<string> {
  await connectDB();

  const payload = {
    subjectId: input.context.subjectId,
    language: "english" as const,
    basicExplanation: input.content.basicExplanation,
    whyItMatters: input.content.whyItMatters,
    realWorldAnalogy: input.content.realWorldAnalogy,
    terminology: input.content.terminology,
    practicalExplanation: input.content.practicalExplanation,
    realWorldExamples: input.content.realWorldExamples,
    codeExample: input.content.codeExample,
    keyPoints: input.content.keyPoints,
    commonMistakes: input.content.commonMistakes,
    prerequisites: input.content.prerequisites,
    checkYourUnderstanding: input.content.checkYourUnderstanding,
    advancedOverview: input.content.advancedOverview,
    origin: "ai-generated" as const,
    status: "ai-draft" as const,
    provider: input.provider,
    model: input.model,
    promptVersion: TOPIC_CONTENT_PROMPT_VERSION,
    generatedAt: new Date(),
    updatedBy: input.adminId,
    // A regeneration is a new version of the same document, and the number is
    // what a reviewer uses to tell "this is the text I rejected" from "this is
    // the rewrite".
    ...(input.existingId ? {} : { createdBy: input.adminId, contentVersion: 1 }),
  };

  if (input.existingId) {
    await TopicContent.updateOne(
      { _id: input.existingId },
      { $set: payload, $inc: { contentVersion: 1 } }
    );
    return input.existingId;
  }

  const created = await TopicContent.create({ topicId: input.context.topicId, ...payload });

  /**
   * The topic's `hasPublishedContent` flag is deliberately not touched.
   *
   * A draft is not published content, and setting the flag here would put
   * "Explanation ready" on the student's subject page against text no human has
   * read. Only the publish transition sets it.
   */
  return String(created._id);
}
