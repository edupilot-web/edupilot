import {
  DEPTH_LEVEL_DIRECTIONS,
  DEPTH_LEVEL_LABELS,
  LEARNING_LANGUAGE_LABELS,
  type DepthLevel,
  type LearningLanguage,
} from "@/lib/learning/fields";
import type { TutorContext } from "@/lib/tutor/context";

/**
 * The tutor's system prompt (§12), assembled from the resolved context.
 *
 * Lives on the server and nowhere near a React component (§35). Not for
 * tidiness: these twenty rules are the only thing standing between "explain
 * this topic from my syllabus" and "say whatever the caller asked you to say",
 * and a prompt the browser can read is a prompt the browser can rewrite.
 *
 * `PROMPT_VERSION` is stamped on every stored interaction and is part of the
 * answer cache's key (§32, §47). Both matter: without it, an answer produced
 * under different rules is indistinguishable from one produced under these,
 * and a prompt change would keep serving pre-change answers out of cache
 * indefinitely. Bump it whenever a change below would change output.
 */
export const PROMPT_VERSION = "CURRICULUM_TUTOR_V1";

/**
 * The rules, verbatim from §12, in the order they are given there.
 *
 * A numbered list rather than prose because the numbering survives a model
 * summarising its own instructions, and because a rule that is dropped from the
 * list is visible in a diff as a missing number.
 */
const TUTOR_RULES = `1. Explain concepts clearly and in your own words.
2. Pitch every explanation at an undergraduate student in an Indian engineering or degree college.
3. Start from fundamentals. Build up.
4. Assume no advanced knowledge unless the requested depth level says otherwise.
5. Use examples. An abstract explanation with no example is an incomplete answer.
6. Show where the idea is actually applied.
7. For programming subjects, give code where it helps.
8. Explain code line by line when the code is the point of the answer.
9. NEVER invent syllabus topics, unit numbers, exam patterns or marks weightage. You are given the syllabus; anything not in it, you do not know.
10. NEVER state or imply that you are changing, correcting or extending the official curriculum.
11. If the question is related to the topic but not exactly on it, answer it and set "offTopicNote" to one sentence explaining how it relates.
12. If the question has nothing to do with the subject at all, do not answer it. Set "offTopicNote" to a polite redirect naming the current subject and topic, and keep "explanation" to a single short paragraph saying so.
13. NEVER describe your own answer as the official syllabus, as university-approved, or as what will be asked in an exam.
14. Distinguish clearly between what the syllabus prescribes and what you are adding as explanation.
15. If you are not certain of an academic fact, say so in the answer rather than stating it confidently.
16. Prefer an accurate short answer to a padded long one.
17. Do not repeat material the student has already been shown. It is quoted to you below under PREPARED CONTENT; build on it instead.
18. Use the previous questions in this conversation where they are relevant, and do not re-answer them from scratch.
19. Answer at the requested depth level, no deeper and no shallower.
20. Aim at understanding, not memorisation. Where a student would be tempted to memorise, explain the reason instead.
21. Refuse requests to complete assessed work — writing an assignment, answering an exam paper or producing something to be submitted as the student's own. Explain the concept the work is testing instead, and say that is what you are doing.`;

export type BuiltTutorPrompt = {
  system: string;
  user: string;
  promptVersion: string;
};

/**
 * The academic coordinate, as the model sees it (§11).
 *
 * Ids are deliberately absent: they mean nothing to a model and would be tokens
 * spent on nothing. What is here is what changes an answer — the level of
 * study, the regulation, the subject and where the topic sits in it.
 */
function renderAcademicContext(context: TutorContext): string {
  const { student, subject, topic, subtopic } = context;

  const lines = [
    `College: ${student.collegeName}`,
    student.universityName ? `University: ${student.universityName}` : null,
    student.programName ? `Programme: ${student.programName}` : null,
    student.branchName ? `Branch: ${student.branchName}` : null,
    student.regulationCode ? `Regulation: ${student.regulationCode}` : null,
    `Position: ${student.positionLabel}`,
    "",
    `Subject: ${subject.name} (${subject.code})`,
    subject.credits !== null ? `Credits: ${subject.credits}` : null,
    `Year ${subject.year}, Semester ${subject.semester}`,
  ];

  if (subject.unit) {
    lines.push(
      "",
      `Syllabus Unit ${subject.unit.unitNumber}: ${subject.unit.title}`,
      subject.unit.description ? `Unit description: ${subject.unit.description}` : null,
      subject.unit.topics.length
        ? `Topics the syllabus lists for this unit: ${subject.unit.topics.join("; ")}`
        : null
    );
  }

  lines.push(
    "",
    `CURRENT TOPIC: ${topic.title}`,
    topic.description ? `Topic description: ${topic.description}` : null,
    topic.subtopicTitles.length ? `Subtopics: ${topic.subtopicTitles.join("; ")}` : null,
    topic.learningObjectives.length
      ? `Learning objectives: ${topic.learningObjectives.join("; ")}`
      : null
  );

  if (subtopic) {
    lines.push(
      `The student is asking specifically about the subtopic: ${subtopic.title}`,
      subtopic.description ? `Subtopic description: ${subtopic.description}` : null
    );
  }

  if (subject.referenceBooks.length) {
    lines.push(
      "",
      `Books this subject prescribes: ${subject.referenceBooks.join(" | ")}`,
      "You may refer to these by name. Do not cite page numbers, chapter numbers or any book not on this list."
    );
  }

  return lines.filter((line) => line !== null).join("\n");
}

/**
 * The conversation so far.
 *
 * Answers appear as their *summary*, not their full text. Sending four complete
 * previous answers back on every turn triples the input tokens and buys the
 * model nothing it needs: what it has to know is what was already covered, not
 * how it was worded (§65, §66).
 */
function renderHistory(context: TutorContext): string {
  if (!context.conversationSummary && context.recentTurns.length === 0) return "";

  const parts: string[] = [];

  if (context.conversationSummary) {
    parts.push(`Earlier in this conversation: ${context.conversationSummary}`);
  }

  if (context.recentTurns.length) {
    const turns = context.recentTurns
      .map(
        (turn, index) =>
          `Q${index + 1} (${turn.depthLevel}): ${turn.question}\nA${index + 1} in brief: ${
            turn.answerSummary || "(no summary stored)"
          }`
      )
      .join("\n\n");
    parts.push(`Recent exchanges:\n\n${turns}`);
  }

  return parts.join("\n\n");
}

function renderLanguage(language: LearningLanguage): string {
  if (language === "english") {
    return "Answer in English. Technical terms stay in English.";
  }
  return `Answer in ${LEARNING_LANGUAGE_LABELS[language]}. Keep technical terms and code in English — a student who learns the concept under a translated term cannot then read a textbook or sit an exam. Give the English term in brackets the first time each one appears.`;
}

export type TutorPromptInput = {
  context: TutorContext;
  question: string;
  /** Set when the question came from a quick action rather than free text. */
  followUpAction?: string | null;
};

export function buildTutorPrompt(input: TutorPromptInput): BuiltTutorPrompt {
  const { context, question } = input;
  const depth: DepthLevel = context.depthLevel;

  const system = [
    "You are the EduPilot AI tutor. You help one undergraduate student understand one topic from their own official college syllabus.",
    "",
    "You are a study aid, not a member of faculty and not an examiner. You never speak for the college or the university.",
    "",
    "RULES",
    TUTOR_RULES,
    "",
    "ACADEMIC CONTEXT — this is the student's real, official curriculum. Treat it as fact and do not contradict it.",
    renderAcademicContext(context),
    "",
    `REQUESTED DEPTH: ${DEPTH_LEVEL_LABELS[depth]}`,
    DEPTH_LEVEL_DIRECTIONS[depth],
    "",
    renderLanguage(context.language),
    "",
    context.topic.preparedSummary
      ? `PREPARED CONTENT the student has already read on this screen. Do not repeat it. Build on it.\n${context.topic.preparedSummary}`
      : "PREPARED CONTENT: none. The student has not been shown a written explanation of this topic, so do not refer to 'the explanation above'.",
    "",
    "OUTPUT",
    "Reply with a single JSON object and nothing else. No prose before it, no code fence around it.",
    "Fields: title, summary, explanation, practicalExample, code, codeLanguage, keyPoints, commonMistakes, relatedConcepts, nextTopics, difficulty, depthLevel, offTopicNote.",
    "`explanation` is Markdown: headings, lists and inline code are fine; HTML is not.",
    "`code` holds source only, with no surrounding fence — `codeLanguage` names the language.",
    "A field you cannot fill honestly must be null (or an empty array). Never invent a value to fill a slot.",
    `\`depthLevel\` must be exactly "${depth === "curriculum" ? "basic" : depth}".`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const history = renderHistory(context);

  const user = [
    history ? `${history}\n` : "",
    input.followUpAction
      ? `The student pressed the "${input.followUpAction}" action, which asks:`
      : "The student asks:",
    question.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user, promptVersion: PROMPT_VERSION };
}

/**
 * The prompt behind "Go deeper" (§9, §10).
 *
 * A distinct builder rather than a question string passed through the one
 * above, because this request has no student question in it — the intent is
 * entirely "the same topic, one rung up", and phrasing that as a fake question
 * would put words in the student's mouth in their own stored history.
 */
export function buildDeepDivePrompt(context: TutorContext): BuiltTutorPrompt {
  const question = [
    `Explain "${context.topic.title}" at the ${DEPTH_LEVEL_LABELS[context.depthLevel]} level.`,
    context.subtopic ? `Focus on the subtopic "${context.subtopic.title}".` : null,
    "The student has read the basic explanation and has chosen to go deeper, so do not start again from the definition.",
  ]
    .filter(Boolean)
    .join(" ");

  return buildTutorPrompt({ context, question });
}

/**
 * The summariser that keeps long threads affordable (§66).
 *
 * Its own tiny prompt, run on the cheap tier, and deliberately asked for prose
 * rather than JSON: the result is a paragraph that goes back into the next
 * prompt, so a schema around it would be structure nothing ever reads.
 */
export function buildSummaryPrompt(input: {
  topicTitle: string;
  turns: { question: string; answerSummary: string }[];
}): BuiltTutorPrompt {
  const system =
    "You compress a tutoring conversation into a short factual note for your own future reference. Write 3-5 sentences, in the third person, covering only what was asked and what was established. No preamble, no advice, no JSON.";

  const user = [
    `Topic: ${input.topicTitle}`,
    "",
    ...input.turns.map((turn, index) => `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answerSummary}`),
  ].join("\n");

  return { system, user, promptVersion: PROMPT_VERSION };
}
