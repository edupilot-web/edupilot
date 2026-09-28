import { connectDB } from "@/lib/db";
import { LearningEvent, StudentTopicProgress } from "@/models/Learning";
import { getCurriculumOverview } from "@/lib/curriculum/student-curriculum";
import { Types } from "mongoose";
import {
  listStudentAssignments,
  listStudentNotes,
  type StudentAssignmentCard,
  type StudentNoteCard,
} from "@/lib/teaching/student-view";

/**
 * Everything the dashboard shows, from the database.
 *
 * This module used to be a list of constants — a wallet balance, a timetable,
 * a notice board, a placement — and the screen built on it was the one place in
 * the product that contradicted the student's own profile: it told a
 * semester-3 student about a semester-5 fee deadline and listed subjects they
 * were not taking. Invented data is worse than an empty card, because a student
 * cannot tell which parts of the screen to believe.
 *
 * So the rule here is now simple: **a card exists only if a model backs it.**
 * Wallet, timetable, placements and daily tasks had no model and no API, and
 * they are gone rather than faked. What replaced them is what the platform
 * genuinely knows — the semester the student is in, the work they owe, the
 * notes they have been sent, and what they have actually studied.
 *
 * One function, not six, because the cards are rendered together and six
 * separate loaders would be six round trips for one screen.
 */

export type DashboardSubject = {
  id: string;
  name: string;
  code: string;
  credits: number | null;
};

export type DashboardData = {
  academic: {
    positionLabel: string;
    semesterLabel: string | null;
    collegeName: string;
    branchName: string | null;
    regulationCode: string | null;
    /**
     * True when the *semester* was worked out from the admission year rather
     * than given by the student. The card says so and links to the profile,
     * because a derived semester is a guess and the student is the only one who
     * can correct it.
     *
     * Deliberately `position.source`, not `subjectsConfirmed`: those answer
     * different questions — how we know which semester you are in, and whether
     * you picked your own subjects — and the card's wording is about the first.
     */
    derived: boolean;
    /** Why there are no subjects, when there are none. */
    emptyReason: string | null;
  };
  subjects: { total: number; top: DashboardSubject[] };
  assignments: {
    dueSoon: StudentAssignmentCard[];
    pending: number;
    overdue: number;
  };
  notes: { recent: StudentNoteCard[]; total: number };
  study: {
    /** Consecutive days up to today with at least one learning event. */
    streakDays: number;
    /** Monday-first, this week — which days had activity. */
    week: boolean[];
    topicsStarted: number;
    topicsCompleted: number;
    minutesSpent: number;
  };
};

/** How many days ahead "due soon" reaches. A fortnight is about one unit of work. */
const DUE_SOON_DAYS = 14;

export async function getDashboard(userId: string): Promise<DashboardData> {
  await connectDB();

  const [overview, assignments, notes, study] = await Promise.all([
    getCurriculumOverview(userId),
    listStudentAssignments(userId, { limit: 200 }),
    listStudentNotes(userId, { limit: 4 }),
    studyActivity(userId),
  ]);

  const subjects = overview.state.kind === "ready" ? overview.state.subjects : [];

  const horizon = Date.now() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
  const dueSoon = assignments.cards
    .filter((card) => card.displayStatus === "pending" || card.displayStatus === "overdue")
    .filter((card) => !card.dueAt || new Date(card.dueAt).getTime() <= horizon)
    .slice(0, 4);

  return {
    academic: {
      positionLabel: overview.positionLabel,
      semesterLabel: overview.semesterLabel,
      collegeName: overview.collegeName,
      branchName: overview.branchName,
      regulationCode: overview.regulationCode,
      derived: overview.position.source === "derived-from-admission",
      emptyReason: emptyReasonFor(overview.state.kind),
    },
    subjects: {
      total: subjects.length,
      top: subjects.slice(0, 4).map((subject) => ({
        id: subject.id,
        name: subject.name,
        code: subject.code,
        credits: subject.credits,
      })),
    },
    assignments: {
      dueSoon,
      pending: assignments.counts.pending,
      overdue: assignments.counts.overdue,
    },
    notes: { recent: notes.cards, total: notes.total },
    study,
  };
}

/**
 * Says *why* the subject list is empty, in the student's terms.
 *
 * `getCurriculumOverview` already distinguishes these; flattening them to "no
 * subjects" here would throw away the only thing that tells a student whether
 * to fix their profile, wait for their college, or do nothing.
 */
function emptyReasonFor(kind: string): string | null {
  switch (kind) {
    case "ready":
      return null;
    case "graduated":
      return "You have graduated — there is no current semester.";
    case "no-regulation":
      return "Your college's curriculum is not configured yet.";
    case "no-subjects-for-branch":
      return "No subjects are set up for your branch under this regulation yet.";
    case "no-semester":
      return "We do not know which semester you are in.";
    case "empty-semester":
      return "This semester has no subjects configured yet.";
    default:
      return "Your academic details are incomplete.";
  }
}

/**
 * The study card, from `LearningEvent` and `StudentTopicProgress`.
 *
 * The streak is **derived on read** rather than stored on the profile. A stored
 * counter needs a job that runs at midnight in the right timezone to break it,
 * and is wrong for everyone in the window between the day ending and the job
 * running. Counting distinct days backwards costs one indexed query over a
 * collection that is already TTL'd to a year.
 *
 * A day counts if anything happened in it, at any depth. Weighting a "topic
 * completed" above a "topic opened" would make the number unexplainable to the
 * person it is shown to.
 */
async function studyActivity(userId: string): Promise<DashboardData["study"]> {
  const id = new Types.ObjectId(userId);

  // 60 days is comfortably more than any streak worth displaying, and bounds
  // the scan regardless of how active the account is.
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [events, progress] = await Promise.all([
    LearningEvent.find({ userId: id, createdAt: { $gte: since } })
      .select("createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    StudentTopicProgress.aggregate<{ _id: string; n: number; seconds: number }>([
      { $match: { userId: id } },
      { $group: { _id: "$status", n: { $sum: 1 }, seconds: { $sum: "$timeSpentSeconds" } } },
    ]),
  ]);

  const activeDays = new Set(events.map((event) => dayKey(new Date(event.createdAt))));

  // Counting from today, but not breaking the streak before the day is over:
  // someone who studied yesterday and has not opened the app yet this morning
  // is on a streak, not off one.
  let streakDays = 0;
  const cursor = new Date();
  if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(dayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const started = progress.find((row) => row._id === "in_progress")?.n ?? 0;
  const completed = progress.find((row) => row._id === "completed")?.n ?? 0;
  const seconds = progress.reduce((sum, row) => sum + (row.seconds ?? 0), 0);

  return {
    streakDays,
    week: weekOf(new Date()).map((day) => activeDays.has(dayKey(day))),
    topicsStarted: started + completed,
    topicsCompleted: completed,
    minutesSpent: Math.round(seconds / 60),
  };
}

/** Local calendar day, so "today" means the server's today rather than UTC's. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** This week, Monday first. */
function weekOf(today: Date): Date[] {
  const monday = new Date(today);
  // getDay() is Sunday-first; shift so Monday is 0 and Sunday is 6.
  monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

/**
 * A due date as a student reads it.
 *
 * Relative up to a week out, absolute after that — "in 12 days" is a number
 * nobody converts to a date, and "on 14 March" is useless for something due
 * this afternoon.
 */
export function dueLabel(dueAt: string | null): string {
  if (!dueAt) return "No deadline";

  const due = new Date(dueAt);
  const diffMs = due.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffMs < 0) {
    const overdueDays = Math.abs(diffDays);
    if (overdueDays === 0) return "Due today";
    return overdueDays === 1 ? "1 day overdue" : `${overdueDays} days overdue`;
  }

  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 7) return `Due in ${diffDays} days`;

  return `Due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}
