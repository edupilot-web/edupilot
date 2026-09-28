import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { LearningEvent, StudentTopicProgress } from "@/models/Learning";
import { Topic } from "@/models/Topic";
import { CurriculumSubject } from "@/models/Curriculum";
import { StudentProfile } from "@/models/StudentProfile";
import {
  AUTO_COMPLETE_AT,
  EVENT_PROGRESS_SIGNAL,
  PROGRESS_SIGNALS,
  isLearningEventType,
  isProgressSignal,
  percentageFor,
  type LearningEventType,
  type ProgressSignal,
} from "@/lib/learning/fields";

/**
 * Progress and the event stream (§24, §25).
 *
 * Two rules shape everything here.
 *
 * **A page visit is not progress.** §24 says so and it is not pedantry: a
 * completion percentage that rises because a URL was opened measures curiosity,
 * and the "12 / 20 topics completed" on a subject card would then be a number
 * no student recognises. `TOPIC_OPENED` is recorded as an event and moves
 * nothing. Only the five signals in `PROGRESS_WEIGHTS` do.
 *
 * **Nothing the browser sends is trusted with a number.** The client says
 * *which signal* happened; the server owns the arithmetic, the clamping and the
 * completion threshold. A client that could post a percentage could post 100.
 */

// ── Authorisation ─────────────────────────────────────────────────────────

export type TopicOwnership = {
  topicId: Types.ObjectId;
  subjectId: Types.ObjectId;
  topicTitle: string;
  collegeId: Types.ObjectId | null;
  regulationId: Types.ObjectId | null;
  semester: number | null;
};

/**
 * Confirm the topic belongs to this student's curriculum, and return what a
 * progress or event write needs to denormalise.
 *
 * The student's coordinate is part of the subject query, so a topic from
 * another college is not found rather than found-and-rejected — the same
 * construction as everywhere else in the module, and the reason a probed id
 * tells an attacker nothing (§35, §74).
 *
 * Called on every write. That is one extra query per event, and it is not
 * negotiable: a progress endpoint that took the client's word for which topic
 * it was writing about would let anyone fabricate another college's engagement
 * numbers, and would file the rows under a topic the student cannot see.
 */
export async function authorizeTopic(
  userId: string,
  topicId: string
): Promise<TopicOwnership | null> {
  if (!Types.ObjectId.isValid(topicId)) return null;

  await connectDB();

  const profile = await StudentProfile.findOne({ userId })
    .select("collegeId programId branchId regulationId currentSemester")
    .lean();

  if (!profile?.collegeId || !profile.programId || !profile.branchId || !profile.regulationId) {
    return null;
  }

  const topic = await Topic.findOne({ _id: topicId, status: "published" })
    .select("subjectId title")
    .lean();
  if (!topic) return null;

  const subject = await CurriculumSubject.findOne({
    _id: topic.subjectId,
    collegeId: profile.collegeId,
    programId: profile.programId,
    branchId: profile.branchId,
    regulationId: profile.regulationId,
    status: "active",
  })
    .select("_id semester")
    .lean();

  if (!subject) return null;

  return {
    topicId: topic._id,
    subjectId: subject._id,
    topicTitle: topic.title,
    collegeId: profile.collegeId,
    regulationId: profile.regulationId,
    semester: subject.semester ?? profile.currentSemester ?? null,
  };
}

// ── Progress ──────────────────────────────────────────────────────────────

export type ProgressView = {
  topicId: string;
  status: string;
  progressPercentage: number;
  basicViewed: boolean;
  practicalViewed: boolean;
  advancedViewed: boolean;
  checkAttempted: boolean;
  questionAsked: boolean;
  questionsAsked: number;
  timeSpentSeconds: number;
  deepestLevel: string | null;
  lastViewedAt: string | null;
  completedAt: string | null;
};

/**
 * The largest time increment one call may add.
 *
 * The client sends elapsed seconds on a heartbeat. Clamped because an
 * unclamped counter fed by a browser is not a measurement — it is a field
 * anyone can put a billion into, and "average learning time" would be built on
 * it. Ten minutes is longer than any sensible heartbeat interval and short
 * enough that inflating a total takes real effort.
 */
const MAX_TIME_INCREMENT_SECONDS = 600;

export type RecordProgressInput = {
  userId: string;
  ownership: TopicOwnership;
  /** Signals to set. Already-set signals are left alone — this never unsets. */
  signals?: ProgressSignal[];
  /** Seconds to add, clamped. */
  timeSpentSeconds?: number;
  /** The deepest level reached, for resuming. */
  deepestLevel?: string | null;
  /** True when the student pressed "Mark as complete" themselves. */
  manualComplete?: boolean;
  /** Increment the tutor-question counter. */
  questionAsked?: boolean;
};

/**
 * Apply a progress update and return the row as it now stands.
 *
 * Two round trips rather than one, deliberately. The document has to be read
 * before the percentage can be computed — the percentage is a function of *all*
 * the flags, not of the ones in this request — and a `$set` computed from stale
 * flags is how two concurrent updates (a section viewed and a question asked)
 * end up with one of them lost. The upsert-then-recompute below always writes a
 * percentage consistent with the flags it just persisted.
 */
export async function recordProgress(input: RecordProgressInput): Promise<ProgressView> {
  await connectDB();

  const now = new Date();
  const signalSet: Partial<Record<ProgressSignal, boolean>> = {};
  for (const signal of input.signals ?? []) {
    if (isProgressSignal(signal)) signalSet[signal] = true;
  }

  const increment = Math.min(
    Math.max(0, Math.round(input.timeSpentSeconds ?? 0)),
    MAX_TIME_INCREMENT_SECONDS
  );

  const updated = await StudentTopicProgress.findOneAndUpdate(
    { userId: input.userId, topicId: input.ownership.topicId },
    {
      $set: {
        ...signalSet,
        subjectId: input.ownership.subjectId,
        topicTitle: input.ownership.topicTitle,
        lastViewedAt: now,
        ...(input.deepestLevel ? { deepestLevel: input.deepestLevel } : {}),
      },
      $inc: {
        ...(increment ? { timeSpentSeconds: increment } : {}),
        ...(input.questionAsked ? { questionsAsked: 1 } : {}),
      },
      $setOnInsert: { userId: input.userId, topicId: input.ownership.topicId },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  if (!updated) throw new Error("progress upsert returned nothing");

  const percentage = percentageFor({
    basicViewed: updated.basicViewed,
    practicalViewed: updated.practicalViewed,
    advancedViewed: updated.advancedViewed,
    checkAttempted: updated.checkAttempted,
    questionAsked: updated.questionAsked,
  });

  /**
   * Completion is sticky.
   *
   * Once complete, a topic stays complete even if a later weight change would
   * put it below the threshold. A subject card that showed 12 of 20 last week
   * and 11 today because the platform re-weighted its own scoring is a bug from
   * the student's side, whatever the arithmetic says.
   */
  const wasComplete = updated.status === "completed";
  const complete = wasComplete || input.manualComplete === true || percentage >= AUTO_COMPLETE_AT;

  const finalPercentage = complete ? Math.max(percentage, AUTO_COMPLETE_AT) : percentage;
  const status = complete ? "completed" : percentage > 0 ? "in_progress" : "not_started";

  const needsWrite =
    updated.progressPercentage !== finalPercentage ||
    updated.status !== status ||
    (complete && !updated.completedAt) ||
    (input.manualComplete === true && !updated.manuallyCompletedAt);

  if (needsWrite) {
    await StudentTopicProgress.updateOne(
      { _id: updated._id },
      {
        $set: {
          progressPercentage: finalPercentage,
          status,
          ...(complete && !updated.completedAt ? { completedAt: now } : {}),
          ...(input.manualComplete && !updated.manuallyCompletedAt
            ? { manuallyCompletedAt: now }
            : {}),
        },
      }
    );
  }

  // The freshly-completed transition is worth an event of its own: it is what
  // a "topics completed this week" figure counts, and deriving it from a
  // percentage crossing a line after the fact is guesswork.
  if (complete && !wasComplete) {
    await recordEvent({
      userId: input.userId,
      type: "TOPIC_COMPLETED",
      ownership: input.ownership,
      meta: { percentage: finalPercentage, manual: input.manualComplete === true },
    });
  }

  return {
    topicId: String(input.ownership.topicId),
    status,
    progressPercentage: finalPercentage,
    basicViewed: updated.basicViewed,
    practicalViewed: updated.practicalViewed,
    advancedViewed: updated.advancedViewed,
    checkAttempted: updated.checkAttempted,
    questionAsked: updated.questionAsked,
    questionsAsked: updated.questionsAsked,
    timeSpentSeconds: updated.timeSpentSeconds,
    deepestLevel: updated.deepestLevel ?? null,
    lastViewedAt: (updated.lastViewedAt ?? now).toISOString(),
    completedAt: complete ? (updated.completedAt ?? now).toISOString() : null,
  };
}

/** One student's progress across a subject, keyed by topic id. */
export async function progressForSubject(
  userId: string,
  subjectId: Types.ObjectId | string
): Promise<Map<string, ProgressView>> {
  await connectDB();

  const rows = await StudentTopicProgress.find({ userId, subjectId }).lean();

  return new Map(
    rows.map((row) => [
      String(row.topicId),
      {
        topicId: String(row.topicId),
        status: row.status,
        progressPercentage: row.progressPercentage,
        basicViewed: row.basicViewed,
        practicalViewed: row.practicalViewed,
        advancedViewed: row.advancedViewed,
        checkAttempted: row.checkAttempted,
        questionAsked: row.questionAsked,
        questionsAsked: row.questionsAsked,
        timeSpentSeconds: row.timeSpentSeconds,
        deepestLevel: row.deepestLevel ?? null,
        lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
      },
    ])
  );
}

/** Completed and total counts per subject, for the curriculum cards. */
export async function progressSummaryBySubject(
  userId: string,
  subjectIds: (Types.ObjectId | string)[]
): Promise<Map<string, { completed: number; inProgress: number; lastViewedAt: Date | null }>> {
  if (!subjectIds.length) return new Map();

  await connectDB();

  const rows = await StudentTopicProgress.aggregate<{
    _id: Types.ObjectId;
    completed: number;
    inProgress: number;
    lastViewedAt: Date | null;
  }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        subjectId: { $in: subjectIds.map((id) => new Types.ObjectId(String(id))) },
      },
    },
    {
      $group: {
        _id: "$subjectId",
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
        lastViewedAt: { $max: "$lastViewedAt" },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        completed: row.completed,
        inProgress: row.inProgress,
        lastViewedAt: row.lastViewedAt ?? null,
      },
    ])
  );
}

// ── Events ────────────────────────────────────────────────────────────────

export type RecordEventInput = {
  userId: string;
  type: LearningEventType;
  ownership: TopicOwnership;
  subtopicId?: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * Append one event.
 *
 * Never throws: analytics must not be able to fail the action it is describing.
 * A student whose answer arrived but whose event did not has still had their
 * answer, and the roll-up on `StudentTopicProgress` is the record that drives
 * anything they can see.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  if (!isLearningEventType(input.type)) return;

  try {
    await connectDB();
    await LearningEvent.create({
      userId: input.userId,
      type: input.type,
      subjectId: input.ownership.subjectId,
      topicId: input.ownership.topicId,
      subtopicId:
        input.subtopicId && Types.ObjectId.isValid(input.subtopicId) ? input.subtopicId : null,
      collegeId: input.ownership.collegeId,
      regulationId: input.ownership.regulationId,
      semester: input.ownership.semester,
      meta: input.meta ?? null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[learning] could not record event:", err);
  }
}

/**
 * The one call the events endpoint makes: record the event, and apply whatever
 * progress it implies.
 *
 * Both in one function so the two can never disagree about what an event means
 * — the mapping lives in `EVENT_PROGRESS_SIGNAL` and is read exactly here.
 */
export async function applyEvent(input: {
  userId: string;
  type: LearningEventType;
  ownership: TopicOwnership;
  subtopicId?: string | null;
  timeSpentSeconds?: number;
  depthLevel?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<ProgressView> {
  await recordEvent({
    userId: input.userId,
    type: input.type,
    ownership: input.ownership,
    subtopicId: input.subtopicId,
    meta: input.meta,
  });

  const signal = EVENT_PROGRESS_SIGNAL[input.type];

  return recordProgress({
    userId: input.userId,
    ownership: input.ownership,
    signals: signal ? [signal] : [],
    timeSpentSeconds: input.timeSpentSeconds,
    deepestLevel: input.depthLevel ?? null,
  });
}

/** Exported for the tests that check no signal is left unreachable by an event. */
export const REACHABLE_SIGNALS: ProgressSignal[] = PROGRESS_SIGNALS.filter((signal) =>
  Object.values(EVENT_PROGRESS_SIGNAL).includes(signal)
);
