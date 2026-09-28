import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import {
  positionLabel,
  resolveAcademicPosition,
  yearOfSemester,
} from "@/lib/curriculum/position";
import { Program } from "@/models/AcademicStructure";
import { CurriculumSubject, Regulation } from "@/models/Curriculum";
import { StudentProfile } from "@/models/StudentProfile";
import { Subtopic, Topic, TopicContent } from "@/models/Topic";
import { AiConversation, AiInteraction } from "@/models/Tutor";
import { STUDENT_VISIBLE_CONTENT_STATUS, type DepthLevel, type LearningLanguage } from "@/lib/learning/fields";

/**
 * CurriculumContextBuilder (§31, §67 steps 2-10).
 *
 * Everything the model is told about a student comes from here, and everything
 * here comes from the database. The request supplies **ids only** — §30 is
 * explicit, and the reason is not tidiness: a caller that could supply its own
 * subject and topic names could make the tutor answer as though a question
 * belonged to a syllabus it does not, and the answer would be stored under that
 * claim.
 *
 * Authorisation is part of the *query*, not a check after it. The topic lookup
 * carries the student's college, programme, branch and regulation, so a topic
 * from another college is simply not found — the same construction
 * `student-curriculum.ts` uses, and the reason a probed id cannot be used to
 * learn what another college teaches (§35, §74).
 *
 * The context is also deliberately **small** (§31, §65). Not the student's
 * history — the last few turns of *this* thread. Not the subject's whole
 * syllabus — the unit the topic sits in. A context builder that sends
 * everything available is the one that makes every question cost five times
 * what it should and answers worse for it.
 */

// ── Shapes ────────────────────────────────────────────────────────────────

export type StudentContext = {
  userId: string;
  collegeId: string;
  collegeName: string;
  universityName: string | null;
  programName: string | null;
  degree: string | null;
  branchName: string | null;
  regulationId: string;
  regulationCode: string | null;
  admissionYear: number | null;
  year: number | null;
  semester: number | null;
  positionLabel: string;
};

export type SubjectContext = {
  id: string;
  name: string;
  code: string;
  credits: number | null;
  courseType: string;
  year: number;
  semester: number;
  learningObjectives: string[];
  outcomes: string[];
  /** Only the unit the topic belongs to, not the whole syllabus. */
  unit: {
    unitNumber: number;
    title: string;
    description: string | null;
    topics: string[];
  } | null;
  /** Titles only — enough to place the topic in its subject, no more. */
  siblingTopicTitles: string[];
  referenceBooks: string[];
};

export type TopicContextShape = {
  id: string;
  title: string;
  description: string | null;
  sequence: number;
  difficulty: string;
  unitNumber: number | null;
  learningObjectives: string[];
  keywords: string[];
  subtopicTitles: string[];
  /** The prepared explanation, when one is published — grounding, not output. */
  preparedSummary: string | null;
};

export type ConversationTurn = {
  question: string;
  /** The stored answer's summary, never its full text — see `recentTurns`. */
  answerSummary: string;
  depthLevel: string;
};

export type TutorContext = {
  student: StudentContext;
  subject: SubjectContext;
  topic: TopicContextShape;
  subtopic: { id: string; title: string; description: string | null } | null;
  conversationId: string | null;
  /** Older turns, compressed. Null until a thread outgrows its window (§66). */
  conversationSummary: string | null;
  recentTurns: ConversationTurn[];
  depthLevel: DepthLevel;
  language: LearningLanguage;
};

/**
 * Why a context could not be built.
 *
 * A closed set, because each one needs a different HTTP status and a different
 * sentence to the student — and because "not found" and "not yours" must
 * produce the *same* one (`topic-not-found`), or the difference between them
 * becomes a way to enumerate another college's curriculum.
 */
export type ContextRefusalCode =
  | "no-profile"
  | "incomplete-profile"
  | "topic-not-found"
  | "subtopic-not-found"
  | "conversation-not-found";

export type ContextResult =
  | { ok: true; context: TutorContext }
  | { ok: false; code: ContextRefusalCode; message: string };

// ── Limits (§65) ──────────────────────────────────────────────────────────

/**
 * How many previous turns travel with a question.
 *
 * Four exchanges is enough for "explain that last part again" to work and short
 * enough that a long thread does not quietly become the most expensive request
 * in the system. Anything older is represented by `conversationSummary`.
 */
const RECENT_TURNS = 4;

/** Where the summary takes over from verbatim turns. */
export const SUMMARIZE_AFTER_TURNS = 8;

/** Sibling titles are for orientation, not a syllabus dump. */
const MAX_SIBLING_TITLES = 20;

// ── Builder ───────────────────────────────────────────────────────────────

export type ContextRequest = {
  userId: string;
  topicId: string;
  subtopicId?: string | null;
  conversationId?: string | null;
  depthLevel: DepthLevel;
  language?: LearningLanguage;
};

export async function buildTutorContext(request: ContextRequest): Promise<ContextResult> {
  if (!Types.ObjectId.isValid(request.topicId)) {
    return { ok: false, code: "topic-not-found", message: "That topic could not be found." };
  }

  await connectDB();

  const profile = await StudentProfile.findOne({ userId: request.userId }).lean();
  if (!profile) {
    return {
      ok: false,
      code: "no-profile",
      message: "Finish setting up your academic profile before using the AI tutor.",
    };
  }
  if (!profile.collegeId || !profile.programId || !profile.branchId || !profile.regulationId) {
    return {
      ok: false,
      code: "incomplete-profile",
      message:
        "Your college has no curriculum configured yet, so the tutor has nothing to ground an answer on.",
    };
  }

  const topic = await Topic.findOne({ _id: request.topicId, status: "published" }).lean();
  if (!topic) {
    return { ok: false, code: "topic-not-found", message: "That topic could not be found." };
  }

  /**
   * The authorisation query (§35, §74).
   *
   * The student's whole coordinate is in the filter. A topic belonging to
   * another college resolves to a subject this `findOne` will not return, and
   * the caller gets `topic-not-found` — identical to a topic id that does not
   * exist at all.
   */
  const subject = await CurriculumSubject.findOne({
    _id: topic.subjectId,
    collegeId: profile.collegeId,
    programId: profile.programId,
    branchId: profile.branchId,
    regulationId: profile.regulationId,
    status: "active",
  }).lean();

  if (!subject) {
    return { ok: false, code: "topic-not-found", message: "That topic could not be found." };
  }

  let subtopic: TutorContext["subtopic"] = null;
  if (request.subtopicId) {
    if (!Types.ObjectId.isValid(request.subtopicId)) {
      return { ok: false, code: "subtopic-not-found", message: "That subtopic could not be found." };
    }
    // Scoped to the topic that was just authorised, so a subtopic id from
    // elsewhere cannot ride in on an authorised topic.
    const row = await Subtopic.findOne({
      _id: request.subtopicId,
      topicId: topic._id,
      status: "published",
    })
      .select("title description")
      .lean();

    if (!row) {
      return { ok: false, code: "subtopic-not-found", message: "That subtopic could not be found." };
    }
    subtopic = {
      id: String(row._id),
      title: row.title,
      description: row.description ?? null,
    };
  }

  const [regulation, program, subtopicTitles, siblings, prepared] = await Promise.all([
    Regulation.findById(profile.regulationId).select("code totalSemesters").lean(),
    Program.findById(profile.programId).select("durationYears name degree").lean(),
    Subtopic.find({ topicId: topic._id, status: "published" })
      .select("title")
      .sort({ sequence: 1 })
      .lean(),
    Topic.find({ subjectId: subject._id, status: "published" })
      .select("title sequence")
      .sort({ sequence: 1 })
      .limit(MAX_SIBLING_TITLES)
      .lean(),
    TopicContent.findOne({
      topicId: topic._id,
      language: request.language ?? "english",
      status: STUDENT_VISIBLE_CONTENT_STATUS,
    })
      .select("basicExplanation whyItMatters keyPoints")
      .lean(),
  ]);

  const position = resolveAcademicPosition({
    studyStatus: profile.studyStatus,
    admissionYear: profile.admissionYear,
    admissionType: profile.admissionType,
    currentYear: profile.currentYear,
    currentSemester: profile.currentSemester,
    totalSemesters: regulation?.totalSemesters ?? null,
    durationYears: program?.durationYears ?? null,
  });

  const unit =
    topic.unitNumber !== null && topic.unitNumber !== undefined
      ? (subject.units ?? []).find((entry) => entry.unitNumber === topic.unitNumber) ?? null
      : null;

  const conversation = await resolveConversation(request, topic._id);
  if (conversation.refused) {
    return {
      ok: false,
      code: "conversation-not-found",
      message: "That conversation could not be found.",
    };
  }

  return {
    ok: true,
    context: {
      student: {
        userId: request.userId,
        collegeId: String(profile.collegeId),
        collegeName: profile.collegeName,
        universityName: profile.universityName ?? null,
        programName: profile.programName ?? program?.name ?? null,
        degree: profile.degree ?? null,
        branchName: profile.branchName ?? null,
        regulationId: String(profile.regulationId),
        regulationCode: regulation?.code ?? profile.regulationCode ?? null,
        admissionYear: profile.admissionYear ?? null,
        year: position.year,
        semester: position.semester,
        positionLabel: positionLabel(position),
      },
      subject: {
        id: String(subject._id),
        name: subject.name,
        code: subject.code,
        credits: subject.credits ?? null,
        courseType: subject.courseType ?? "Core",
        year: subject.year ?? yearOfSemester(subject.semester),
        semester: subject.semester,
        learningObjectives: subject.learningObjectives ?? [],
        outcomes: subject.outcomes ?? [],
        unit: unit
          ? {
              unitNumber: unit.unitNumber,
              title: unit.title,
              description: unit.description ?? null,
              topics: unit.topics ?? [],
            }
          : null,
        siblingTopicTitles: siblings.map((entry) => entry.title),
        referenceBooks: (subject.referenceBooks ?? [])
          .slice(0, 5)
          .map((book) => (book.authors ? `${book.title} — ${book.authors}` : book.title)),
      },
      topic: {
        id: String(topic._id),
        title: topic.title,
        description: topic.description ?? null,
        sequence: topic.sequence,
        difficulty: topic.difficulty ?? "basic",
        unitNumber: topic.unitNumber ?? null,
        learningObjectives: topic.learningObjectives ?? [],
        keywords: topic.keywords ?? [],
        subtopicTitles: subtopicTitles.map((entry) => entry.title),
        /**
         * The prepared explanation is sent as *grounding*, trimmed hard.
         *
         * Its purpose is to stop the tutor contradicting what the student just
         * read on the same screen (§12 rule 17). Sending the whole thing would
         * roughly double the input tokens of every request to restate material
         * the student already has.
         */
        preparedSummary: prepared
          ? summarizePrepared(prepared.basicExplanation, prepared.whyItMatters, prepared.keyPoints)
          : null,
      },
      subtopic,
      conversationId: conversation.id,
      conversationSummary: conversation.summary,
      recentTurns: conversation.turns,
      depthLevel: request.depthLevel,
      language: request.language ?? "english",
    },
  };
}

/**
 * Load the thread, if there is one, and the tail of it worth sending.
 *
 * A conversation id from the browser is verified against *this* user and *this*
 * topic before a single message is read. Without both checks, a valid id
 * belonging to someone else would pull their questions into this student's
 * prompt — which is §71's exact prohibition, arriving through the back door.
 */
async function resolveConversation(
  request: ContextRequest,
  topicId: Types.ObjectId
): Promise<{
  refused: boolean;
  id: string | null;
  summary: string | null;
  turns: ConversationTurn[];
}> {
  if (!request.conversationId) {
    return { refused: false, id: null, summary: null, turns: [] };
  }
  if (!Types.ObjectId.isValid(request.conversationId)) {
    return { refused: true, id: null, summary: null, turns: [] };
  }

  const conversation = await AiConversation.findOne({
    _id: request.conversationId,
    userId: request.userId,
    topicId,
  })
    .select("summary summarizedThrough")
    .lean();

  if (!conversation) return { refused: true, id: null, summary: null, turns: [] };

  const recent = await AiInteraction.find({
    conversationId: conversation._id,
    status: "ok",
    sequence: { $gt: conversation.summarizedThrough ?? 0 },
  })
    .select("question answer.summary depthLevel sequence")
    .sort({ sequence: -1 })
    .limit(RECENT_TURNS)
    .lean();

  return {
    refused: false,
    id: String(conversation._id),
    summary: conversation.summary ?? null,
    // Reversed back into chronological order: a model reading a conversation
    // backwards infers the wrong thing about what was asked first.
    turns: recent.reverse().map((entry) => ({
      question: entry.question,
      answerSummary: entry.answer?.summary ?? "",
      depthLevel: entry.depthLevel ?? "basic",
    })),
  };
}

/**
 * Compress the prepared content into a grounding paragraph.
 *
 * Truncation at a sentence boundary rather than a character count, so the
 * fragment the model reads is a complete thought. A prompt that ends mid-clause
 * invites the model to finish the sentence rather than answer the question.
 */
function summarizePrepared(
  explanation: string | null | undefined,
  why: string | null | undefined,
  keyPoints: string[] | null | undefined
): string | null {
  const parts: string[] = [];

  if (explanation) parts.push(firstSentences(explanation, 3));
  if (why) parts.push(firstSentences(why, 1));
  if (keyPoints?.length) parts.push(`Key points already shown: ${keyPoints.slice(0, 5).join("; ")}`);

  const joined = parts.filter(Boolean).join(" ");
  return joined.trim() ? joined.trim().slice(0, 1200) : null;
}

function firstSentences(text: string, count: number): string {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  return sentences.slice(0, count).join(" ");
}

/**
 * A stable fingerprint of the context, for comparing two answers fairly (§22).
 *
 * Hashed rather than stored as the joined string. Three ids plus two labels is
 * ninety characters, which is both longer than the column and longer than it
 * needs to be — the value is only ever compared for equality, never read back
 * apart. Fixed at 64 hex characters, whatever is added to the tuple later.
 */
export function contextFingerprint(context: TutorContext): string {
  return createHash("sha256")
    .update(
      [
        context.topic.id,
        context.subject.id,
        context.student.regulationId,
        context.depthLevel,
        context.language,
        context.subtopic?.id ?? "-",
      ].join("|")
    )
    .digest("hex");
}
