import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { CurriculumSubject } from "@/models/Curriculum";
import { Topic, TopicContent } from "@/models/Topic";
import {
  TOPIC_CONTENT_STATUS_LABELS,
  type TopicContentStatus,
} from "@/lib/learning/fields";

/**
 * Admin reads for the topic-content workflow (§26, §45, §46).
 *
 * The reviewer's question is never "show me a topic" — it is "which topics in
 * this subject have content, what state is each in, and what is waiting for
 * me". So the unit of the list is the **topic**, with its content status
 * attached, rather than the content documents alone: a subject where nothing
 * has been generated would otherwise render as an empty screen that looks
 * broken, when what it actually means is that there is work to do.
 */

export type TopicContentRow = {
  topicId: string;
  title: string;
  sequence: number;
  unitNumber: number | null;
  unitTitle: string | null;
  difficulty: string;
  subtopicCount: number;
  contentId: string | null;
  status: TopicContentStatus | null;
  statusLabel: string;
  origin: string | null;
  provider: string | null;
  model: string | null;
  contentVersion: number | null;
  updatedAt: string | null;
  /** Whether a human has approved it — what §36's provenance notice turns on. */
  approved: boolean;
};

export type SubjectContentView = {
  subject: {
    id: string;
    name: string;
    code: string;
    collegeName: string | null;
    branchName: string | null;
    regulationCode: string | null;
    year: number;
    semester: number;
  };
  rows: TopicContentRow[];
  counts: Record<TopicContentStatus | "none", number>;
};

/**
 * Every topic of one subject, with the state of its content.
 *
 * Two queries and a join in memory, not one per topic: a subject holds twenty
 * to forty topics and a per-row content lookup is how a review screen becomes
 * forty round trips.
 */
export async function getSubjectContent(subjectId: string): Promise<SubjectContentView | null> {
  if (!Types.ObjectId.isValid(subjectId)) return null;

  await connectDB();

  const subject = await CurriculumSubject.findById(subjectId)
    .select("name code collegeName branchName regulationCode year semester")
    .lean();

  if (!subject) return null;

  const [topics, content] = await Promise.all([
    Topic.find({ subjectId: subject._id, status: { $ne: "archived" } })
      .select("title sequence unitNumber unitTitle difficulty subtopicCount")
      .sort({ sequence: 1 })
      .lean(),
    TopicContent.find({ subjectId: subject._id, language: "english" })
      .select("topicId status origin provider model contentVersion updatedAt approvedAt")
      .lean(),
  ]);

  const byTopic = new Map(content.map((row) => [String(row.topicId), row]));

  const counts: Record<string, number> = {
    none: 0,
    "ai-draft": 0,
    "editor-review": 0,
    approved: 0,
    published: 0,
    archived: 0,
  };

  const rows: TopicContentRow[] = topics.map((topic) => {
    const own = byTopic.get(String(topic._id));
    const status = (own?.status as TopicContentStatus | undefined) ?? null;

    counts[status ?? "none"] = (counts[status ?? "none"] ?? 0) + 1;

    return {
      topicId: String(topic._id),
      title: topic.title,
      sequence: topic.sequence,
      unitNumber: topic.unitNumber ?? null,
      unitTitle: topic.unitTitle ?? null,
      difficulty: topic.difficulty ?? "basic",
      subtopicCount: topic.subtopicCount ?? 0,
      contentId: own ? String(own._id) : null,
      status,
      statusLabel: status ? TOPIC_CONTENT_STATUS_LABELS[status] : "Not written",
      origin: own?.origin ?? null,
      provider: own?.provider ?? null,
      model: own?.model ?? null,
      contentVersion: own?.contentVersion ?? null,
      updatedAt: own?.updatedAt?.toISOString() ?? null,
      approved: Boolean(own?.approvedAt),
    };
  });

  return {
    subject: {
      id: String(subject._id),
      name: subject.name,
      code: subject.code,
      collegeName: subject.collegeName ?? null,
      branchName: subject.branchName ?? null,
      regulationCode: subject.regulationCode ?? null,
      year: subject.year,
      semester: subject.semester,
    },
    rows,
    counts: counts as SubjectContentView["counts"],
  };
}

export type ReviewQueueEntry = {
  contentId: string;
  topicId: string;
  topicTitle: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  collegeName: string | null;
  status: TopicContentStatus;
  statusLabel: string;
  origin: string;
  provider: string | null;
  updatedAt: string | null;
};

/**
 * What is waiting for a reviewer, across every subject.
 *
 * Drafts and in-review documents only — the two states where somebody has to
 * act. Approved content is waiting on a *publisher*, which is a separate
 * permission and therefore a separate list; mixing them would show every
 * reviewer a pile of rows they cannot do anything about.
 */
export async function getReviewQueue(
  options: { status?: TopicContentStatus; limit?: number } = {}
): Promise<ReviewQueueEntry[]> {
  await connectDB();

  const statuses: TopicContentStatus[] = options.status
    ? [options.status]
    : ["ai-draft", "editor-review"];

  const rows = await TopicContent.find({ status: { $in: statuses } })
    .select("topicId subjectId status origin provider updatedAt")
    .sort({ updatedAt: -1 })
    .limit(Math.min(options.limit ?? 50, 200))
    .lean();

  if (!rows.length) return [];

  const [topics, subjects] = await Promise.all([
    Topic.find({ _id: { $in: rows.map((row) => row.topicId) } })
      .select("title")
      .lean(),
    CurriculumSubject.find({ _id: { $in: rows.map((row) => row.subjectId) } })
      .select("name code collegeName")
      .lean(),
  ]);

  const topicById = new Map(topics.map((topic) => [String(topic._id), topic]));
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));

  return rows.map((row) => {
    const topic = topicById.get(String(row.topicId));
    const subject = subjectById.get(String(row.subjectId));
    const status = row.status as TopicContentStatus;

    return {
      contentId: String(row._id),
      topicId: String(row.topicId),
      // A content row whose topic has been deleted outright is a broken row,
      // and saying so is more useful than rendering a blank line.
      topicTitle: topic?.title ?? "(topic removed)",
      subjectId: String(row.subjectId),
      subjectName: subject?.name ?? "(subject removed)",
      subjectCode: subject?.code ?? "",
      collegeName: subject?.collegeName ?? null,
      status,
      statusLabel: TOPIC_CONTENT_STATUS_LABELS[status],
      origin: row.origin ?? "ai-generated",
      provider: row.provider ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  });
}

/** One content document, in full, for the review screen. */
export async function getTopicContentDetail(contentId: string) {
  if (!Types.ObjectId.isValid(contentId)) return null;

  await connectDB();

  const content = await TopicContent.findById(contentId).lean();
  if (!content) return null;

  const [topic, subject] = await Promise.all([
    Topic.findById(content.topicId).select("title sequence unitNumber unitTitle").lean(),
    CurriculumSubject.findById(content.subjectId)
      .select("name code collegeName branchName regulationCode units")
      .lean(),
  ]);

  const unit =
    topic?.unitNumber !== null && topic?.unitNumber !== undefined
      ? (subject?.units ?? []).find((entry) => entry.unitNumber === topic.unitNumber) ?? null
      : null;

  return {
    content,
    topic,
    subject,
    /**
     * The syllabus the content was supposed to be grounded on, returned
     * alongside it.
     *
     * A reviewer cannot judge whether generated text stays on-syllabus without
     * seeing the syllabus, and making them open another screen to find it is
     * how a review becomes a skim.
     */
    syllabusTopics: unit?.topics ?? [],
    unitTitle: unit?.title ?? null,
  };
}

// ── Subject picker ────────────────────────────────────────────────────────

export type SubjectWithTopics = {
  id: string;
  name: string;
  code: string;
  collegeName: string | null;
  branchName: string | null;
  regulationCode: string | null;
  year: number;
  semester: number;
  topicCount: number;
  publishedCount: number;
};

/**
 * Subjects that have topics, with how much of each is written.
 *
 * Two aggregations rather than a per-subject count, because there are five
 * hundred subjects and nine thousand topics: a `countDocuments` per row would
 * be a thousand queries to render one page.
 *
 * Filtered by a search term over the subject name and code. Deliberately not
 * the full academic cascade the generation screen uses — an operator arriving
 * here already knows which subject they are working on, and four dependent
 * dropdowns to reach it would be four round trips before any work starts.
 */
export async function listSubjectsWithTopics(
  options: { search?: string; limit?: number } = {}
): Promise<SubjectWithTopics[]> {
  await connectDB();

  const limit = Math.min(options.limit ?? 40, 100);
  const search = options.search?.trim();

  const counts = await Topic.aggregate<{
    _id: Types.ObjectId;
    topicCount: number;
    publishedCount: number;
  }>([
    { $match: { status: "published" } },
    {
      $group: {
        _id: "$subjectId",
        topicCount: { $sum: 1 },
        publishedCount: { $sum: { $cond: ["$hasPublishedContent", 1, 0] } },
      },
    },
    { $sort: { publishedCount: -1, topicCount: -1 } },
    // Over-fetch, because the search below filters on fields this aggregation
    // does not hold. Trimmed to `limit` after the join.
    { $limit: search ? 400 : limit },
  ]);

  if (!counts.length) return [];

  const filter: Record<string, unknown> = { _id: { $in: counts.map((row) => row._id) } };
  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ name: pattern }, { code: pattern }, { collegeName: pattern }];
  }

  const subjects = await CurriculumSubject.find(filter)
    .select("name code collegeName branchName regulationCode year semester")
    .limit(limit)
    .lean();

  const countById = new Map(counts.map((row) => [String(row._id), row]));

  return subjects
    .map((subject) => {
      const own = countById.get(String(subject._id));
      return {
        id: String(subject._id),
        name: subject.name,
        code: subject.code,
        collegeName: subject.collegeName ?? null,
        branchName: subject.branchName ?? null,
        regulationCode: subject.regulationCode ?? null,
        year: subject.year,
        semester: subject.semester,
        topicCount: own?.topicCount ?? 0,
        publishedCount: own?.publishedCount ?? 0,
      };
    })
    .sort((a, b) => b.publishedCount - a.publishedCount || b.topicCount - a.topicCount);
}

/**
 * Escape a user's search term before it becomes a regex.
 *
 * An operator typing "C++" or "(Lab)" would otherwise produce an invalid
 * pattern and a 500 — and a term like ".*" would match every subject, which
 * looks like a broken filter rather than a broken query.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
