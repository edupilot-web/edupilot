import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { yearOfSemester } from "@/lib/curriculum/position";
import { CurriculumSubject } from "@/models/Curriculum";
import { StudentProfile } from "@/models/StudentProfile";
import { Subtopic, Topic, TopicContent } from "@/models/Topic";
import { AiConversation, AiInteraction } from "@/models/Tutor";
import { progressForSubject, type ProgressView } from "@/lib/learning/progress";
import {
  STUDENT_VISIBLE_CONTENT_STATUS,
  type LearningLanguage,
} from "@/lib/learning/fields";

/**
 * The student-facing read of topics and their prepared content.
 *
 * Every function takes a `userId` and resolves the academic coordinate from the
 * **profile**, then makes it part of the query. A topic belonging to another
 * college is not found — the same answer as a topic that does not exist, so a
 * probed id reveals nothing (§35, §74). This mirrors `student-curriculum.ts`
 * exactly, which is the point: two different answers to "may I see this" is how
 * one of them ends up being the wrong one.
 *
 * Nothing here calls a model. This is the layer §9 requires: the basic
 * explanation is a database read, and the topic page renders complete before
 * the tutor panel has done anything at all.
 */

// ── Topic list, for the subject page ──────────────────────────────────────

export type TopicCard = {
  id: string;
  title: string;
  description: string | null;
  sequence: number;
  unitNumber: number | null;
  unitTitle: string | null;
  difficulty: string;
  estimatedMinutes: number | null;
  subtopicCount: number;
  /** Whether a prepared explanation exists — "Read" versus "Ask the tutor". */
  hasContent: boolean;
  status: string;
  progressPercentage: number;
  lastViewedAt: string | null;
};

export type SubjectTopics = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  topics: TopicCard[];
  totalTopics: number;
  completedTopics: number;
};

/**
 * Every topic of one subject, with this student's progress against each.
 *
 * Two queries plus one aggregation, not one per topic. A subject holds twenty
 * to forty topics and a per-row progress lookup is the classic way a list view
 * becomes forty round trips — the same mistake `decorateWithBooks` avoids for
 * the subject cards.
 *
 * Returns null when the subject is not this student's, which the caller must
 * render as a 404 rather than as an empty list.
 */
export async function getSubjectTopics(
  userId: string,
  subjectId: string
): Promise<SubjectTopics | null> {
  if (!Types.ObjectId.isValid(subjectId)) return null;

  await connectDB();

  const subject = await authorizeSubject(userId, subjectId);
  if (!subject) return null;

  const [topics, progress] = await Promise.all([
    Topic.find({ subjectId: subject._id, status: "published" })
      .select(
        "title description sequence unitNumber unitTitle difficulty estimatedMinutes subtopicCount hasPublishedContent"
      )
      .sort({ sequence: 1 })
      .lean(),
    progressForSubject(userId, subject._id),
  ]);

  const cards: TopicCard[] = topics.map((topic) => {
    const own = progress.get(String(topic._id));
    return {
      id: String(topic._id),
      title: topic.title,
      description: topic.description ?? null,
      sequence: topic.sequence,
      unitNumber: topic.unitNumber ?? null,
      unitTitle: topic.unitTitle ?? null,
      difficulty: topic.difficulty ?? "basic",
      estimatedMinutes: topic.estimatedMinutes ?? null,
      subtopicCount: topic.subtopicCount ?? 0,
      hasContent: topic.hasPublishedContent === true,
      status: own?.status ?? "not_started",
      progressPercentage: own?.progressPercentage ?? 0,
      lastViewedAt: own?.lastViewedAt ?? null,
    };
  });

  return {
    subjectId: String(subject._id),
    subjectName: subject.name,
    subjectCode: subject.code,
    topics: cards,
    totalTopics: cards.length,
    completedTopics: cards.filter((card) => card.status === "completed").length,
  };
}

// ── One topic, the learning page ──────────────────────────────────────────

export type PreparedContent = {
  basicExplanation: string | null;
  whyItMatters: string | null;
  realWorldAnalogy: string | null;
  terminology: { term: string; meaning: string }[];
  practicalExplanation: string | null;
  realWorldExamples: string[];
  codeExample: {
    language: string | null;
    code: string;
    explanation: string | null;
    output: string | null;
  } | null;
  keyPoints: string[];
  commonMistakes: string[];
  prerequisites: string[];
  checkYourUnderstanding: { question: string; answer: string; hint: string | null }[];
  advancedOverview: string | null;
  /**
   * Whether a human approved this text (§36).
   *
   * The UI must be able to say "prepared for your syllabus and reviewed" versus
   * "AI-generated study material". Publishing already requires approval, so in
   * practice this is true for everything a student sees — it is surfaced anyway
   * so the claim is made from the document rather than from an assumption
   * about the workflow.
   */
  reviewed: boolean;
  origin: string;
  language: string;
};

export type PreviousQuestion = {
  id: string;
  conversationId: string;
  question: string;
  /** The stored summary. Reading the full answer costs no model call (§15). */
  summary: string;
  depthLevel: string;
  cacheHit: boolean;
  createdAt: string;
};

export type TopicConversationSummary = {
  id: string;
  title: string | null;
  depthLevel: string;
  messageCount: number;
  lastMessageAt: string | null;
};

export type TopicNeighbour = { id: string; title: string; sequence: number };

export type TopicView = {
  id: string;
  title: string;
  description: string | null;
  sequence: number;
  difficulty: string;
  estimatedMinutes: number | null;
  learningObjectives: string[];
  keywords: string[];

  unitNumber: number | null;
  unitTitle: string | null;
  /** The syllabus's own words for this unit — official, not generated (§54). */
  unitSyllabusTopics: string[];

  subject: {
    id: string;
    name: string;
    code: string;
    year: number;
    semester: number;
  };

  subtopics: { id: string; title: string; description: string | null; sequence: number }[];

  /** Null when nothing has been published yet — a state the UI must handle. */
  content: PreparedContent | null;

  progress: ProgressView | null;
  previousQuestions: PreviousQuestion[];
  conversations: TopicConversationSummary[];

  previous: TopicNeighbour | null;
  next: TopicNeighbour | null;
  /** Siblings for the left-hand navigation rail. */
  siblings: (TopicNeighbour & { unitNumber: number | null; status: string })[];
};

export async function getTopicView(
  userId: string,
  topicId: string,
  language: LearningLanguage = "english"
): Promise<TopicView | null> {
  if (!Types.ObjectId.isValid(topicId)) return null;

  await connectDB();

  const topic = await Topic.findOne({ _id: topicId, status: "published" }).lean();
  if (!topic) return null;

  // Authorisation is the subject lookup, carrying the student's coordinate.
  const subject = await authorizeSubject(userId, String(topic.subjectId));
  if (!subject) return null;

  const [content, subtopics, siblings, progressMap, previousQuestions, conversations] =
    await Promise.all([
      TopicContent.findOne({
        topicId: topic._id,
        language,
        status: STUDENT_VISIBLE_CONTENT_STATUS,
      }).lean(),
      Subtopic.find({ topicId: topic._id, status: "published" })
        .select("title description sequence")
        .sort({ sequence: 1 })
        .lean(),
      Topic.find({ subjectId: subject._id, status: "published" })
        .select("title sequence unitNumber")
        .sort({ sequence: 1 })
        .lean(),
      progressForSubject(userId, subject._id),
      /**
       * §14's "previously asked" list.
       *
       * Reads the stored summary, never re-generates. This is the query behind
       * the single most important cost property of the module: opening a topic
       * you have asked about before costs nothing.
       */
      AiInteraction.find({ userId, topicId: topic._id, status: "ok" })
        .select("conversationId question answer.summary depthLevel cacheHit createdAt")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      AiConversation.find({ userId, topicId: topic._id, archivedAt: null })
        .select("title depthLevel messageCount lastMessageAt")
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
    ]);

  const unit =
    topic.unitNumber !== null && topic.unitNumber !== undefined
      ? (subject.units ?? []).find((entry) => entry.unitNumber === topic.unitNumber) ?? null
      : null;

  const index = siblings.findIndex((entry) => String(entry._id) === String(topic._id));

  return {
    id: String(topic._id),
    title: topic.title,
    description: topic.description ?? null,
    sequence: topic.sequence,
    difficulty: topic.difficulty ?? "basic",
    estimatedMinutes: topic.estimatedMinutes ?? null,
    learningObjectives: topic.learningObjectives ?? [],
    keywords: topic.keywords ?? [],

    unitNumber: topic.unitNumber ?? null,
    unitTitle: topic.unitTitle ?? unit?.title ?? null,
    unitSyllabusTopics: unit?.topics ?? [],

    subject: {
      id: String(subject._id),
      name: subject.name,
      code: subject.code,
      year: subject.year ?? yearOfSemester(subject.semester),
      semester: subject.semester,
    },

    subtopics: subtopics.map((entry) => ({
      id: String(entry._id),
      title: entry.title,
      description: entry.description ?? null,
      sequence: entry.sequence,
    })),

    content: content
      ? {
          basicExplanation: content.basicExplanation ?? null,
          whyItMatters: content.whyItMatters ?? null,
          realWorldAnalogy: content.realWorldAnalogy ?? null,
          terminology: (content.terminology ?? []).map((entry) => ({
            term: entry.term,
            meaning: entry.meaning,
          })),
          practicalExplanation: content.practicalExplanation ?? null,
          realWorldExamples: content.realWorldExamples ?? [],
          codeExample: content.codeExample
            ? {
                language: content.codeExample.language ?? null,
                code: content.codeExample.code,
                explanation: content.codeExample.explanation ?? null,
                output: content.codeExample.output ?? null,
              }
            : null,
          keyPoints: content.keyPoints ?? [],
          commonMistakes: content.commonMistakes ?? [],
          prerequisites: content.prerequisites ?? [],
          checkYourUnderstanding: (content.checkYourUnderstanding ?? []).map((entry) => ({
            question: entry.question,
            answer: entry.answer,
            hint: entry.hint ?? null,
          })),
          advancedOverview: content.advancedOverview ?? null,
          reviewed: Boolean(content.approvedAt),
          origin: content.origin ?? "ai-generated",
          language: content.language ?? "english",
        }
      : null,

    progress: progressMap.get(String(topic._id)) ?? null,

    previousQuestions: previousQuestions.map((entry) => ({
      id: String(entry._id),
      conversationId: String(entry.conversationId),
      question: entry.question,
      summary: entry.answer?.summary ?? "",
      depthLevel: entry.depthLevel ?? "basic",
      cacheHit: entry.cacheHit === true,
      createdAt: entry.createdAt?.toISOString() ?? new Date().toISOString(),
    })),

    conversations: conversations.map((entry) => ({
      id: String(entry._id),
      title: entry.title ?? null,
      depthLevel: entry.depthLevel ?? "basic",
      messageCount: entry.messageCount ?? 0,
      lastMessageAt: entry.lastMessageAt?.toISOString() ?? null,
    })),

    previous: index > 0 ? neighbour(siblings[index - 1]) : null,
    next: index >= 0 && index < siblings.length - 1 ? neighbour(siblings[index + 1]) : null,

    siblings: siblings.map((entry) => ({
      ...neighbour(entry),
      unitNumber: entry.unitNumber ?? null,
      status: progressMap.get(String(entry._id))?.status ?? "not_started",
    })),
  };
}

function neighbour(entry: { _id: Types.ObjectId; title: string; sequence: number }): TopicNeighbour {
  return { id: String(entry._id), title: entry.title, sequence: entry.sequence };
}

// ── Search (§42) ──────────────────────────────────────────────────────────

export type SearchHit = {
  kind: "subject" | "topic" | "subtopic";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

/**
 * Search inside the student's own curriculum.
 *
 * Scoped to the subjects their coordinate resolves to, so "binary" cannot
 * return a topic from a regulation they are not on (§42). Regex rather than the
 * text index: a student typing "bin" expects "Binary Search" while a text index
 * matches whole terms only, and a prefix search over the few hundred topics of
 * one semester is not a query worth optimising away from correctness.
 */
export async function searchCurriculum(
  userId: string,
  query: string,
  limit = 12
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  await connectDB();

  const profile = await StudentProfile.findOne({ userId })
    .select("collegeId programId branchId regulationId")
    .lean();

  if (!profile?.collegeId || !profile.programId || !profile.branchId || !profile.regulationId) {
    return [];
  }

  const subjects = await CurriculumSubject.find({
    collegeId: profile.collegeId,
    programId: profile.programId,
    branchId: profile.branchId,
    regulationId: profile.regulationId,
    status: "active",
  })
    .select("_id name code")
    .lean();

  const pattern = new RegExp(escapeRegExp(trimmed), "i");
  const subjectIds = subjects.map((subject) => subject._id);
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));

  const [topics, subtopics] = await Promise.all([
    Topic.find({ subjectId: { $in: subjectIds }, status: "published", title: pattern })
      .select("title subjectId sequence")
      .limit(limit)
      .lean(),
    Subtopic.find({ subjectId: { $in: subjectIds }, status: "published", title: pattern })
      .select("title topicId subjectId")
      .limit(limit)
      .lean(),
  ]);

  const hits: SearchHit[] = [];

  for (const subject of subjects) {
    if (pattern.test(subject.name) || pattern.test(subject.code)) {
      hits.push({
        kind: "subject",
        id: String(subject._id),
        title: subject.name,
        subtitle: subject.code,
        href: `/curriculum/${String(subject._id)}`,
      });
    }
  }

  for (const topic of topics) {
    const subject = subjectById.get(String(topic.subjectId));
    hits.push({
      kind: "topic",
      id: String(topic._id),
      title: topic.title,
      subtitle: subject ? `${subject.code} · ${subject.name}` : null,
      href: `/curriculum/${String(topic.subjectId)}/topics/${String(topic._id)}`,
    });
  }

  for (const subtopic of subtopics) {
    const subject = subjectById.get(String(subtopic.subjectId));
    hits.push({
      kind: "subtopic",
      id: String(subtopic._id),
      title: subtopic.title,
      subtitle: subject ? `${subject.code} · ${subject.name}` : null,
      href: `/curriculum/${String(subtopic.subjectId)}/topics/${String(subtopic.topicId)}`,
    });
  }

  return hits.slice(0, limit);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Shared authorisation ──────────────────────────────────────────────────

/**
 * The subject, if and only if it belongs to this student's coordinate.
 *
 * One function so the topic list, the topic view and the search all apply the
 * identical rule — three copies of this filter is three chances for one of them
 * to omit `branchId` and quietly answer with another branch's curriculum.
 */
async function authorizeSubject(userId: string, subjectId: string) {
  const profile = await StudentProfile.findOne({ userId })
    .select("collegeId programId branchId regulationId")
    .lean();

  if (!profile?.collegeId || !profile.programId || !profile.branchId || !profile.regulationId) {
    return null;
  }

  return CurriculumSubject.findOne({
    _id: subjectId,
    collegeId: profile.collegeId,
    programId: profile.programId,
    branchId: profile.branchId,
    regulationId: profile.regulationId,
    status: "active",
  })
    .select("_id name code year semester units")
    .lean();
}
