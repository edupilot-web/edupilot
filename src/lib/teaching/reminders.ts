import { connectDB } from "@/lib/db";
import { Assignment, AssignmentStudent } from "@/models/Assignment";
import { notify } from "@/lib/notifications/service";
import { isSubmittedStatus, type AssignmentStudentStatus } from "@/lib/teaching/fields";

/**
 * Deadline reminders (§41, §80).
 *
 * Two windows — a day out and two hours out — and one rule that matters more
 * than either: **a student who has already submitted is never reminded.** §80
 * states it, and it is the difference between a useful nudge and the kind of
 * notification people mute the platform over.
 *
 * `remindersSent` on the student's own row is what makes this idempotent. The
 * notification collection's unique key is
 * `(recipient, type, entity)`, so a second `ASSIGNMENT_DUE_SOON` for the same
 * assignment would be silently dropped — which would be *correct* but
 * indistinguishable from a bug when the two-hour reminder failed to appear. The
 * per-window marker makes the two reminders distinguishable and the sweep
 * re-runnable.
 *
 * There is no scheduler in the platform. This is written as a function a cron
 * job, a platform scheduler or an operator can call; `npm run reminders` runs
 * it once. That is an honest gap rather than a hidden one: a reminder system
 * whose trigger does not exist would otherwise look finished.
 */

export type ReminderWindow = {
  key: string;
  /** How far ahead of the deadline this window sits, in minutes. */
  leadMinutes: number;
  type: "ASSIGNMENT_DUE_SOON" | "ASSIGNMENT_OVERDUE";
};

/**
 * The windows, in the order they fire.
 *
 * `overdue` is included because it is the same sweep with a negative lead: a
 * separate job for it would duplicate every line of this one, and the "do not
 * remind somebody who submitted" rule is exactly the same.
 */
export const REMINDER_WINDOWS: ReminderWindow[] = [
  { key: "due-24h", leadMinutes: 24 * 60, type: "ASSIGNMENT_DUE_SOON" },
  { key: "due-2h", leadMinutes: 2 * 60, type: "ASSIGNMENT_DUE_SOON" },
  { key: "overdue", leadMinutes: -60, type: "ASSIGNMENT_OVERDUE" },
];

export type SweepResult = {
  window: string;
  assignmentsChecked: number;
  notified: number;
  skippedSubmitted: number;
};

/**
 * Run one window.
 *
 * The tolerance is what makes a cron job that runs every fifteen minutes work
 * without either missing a window or firing it repeatedly: an assignment is in
 * the window if its deadline falls inside `[lead, lead + tolerance]`, and the
 * `remindersSent` marker stops a second run inside the same band from sending
 * twice.
 */
export async function sweepReminders(
  window: ReminderWindow,
  options: { toleranceMinutes?: number; now?: Date } = {}
): Promise<SweepResult> {
  await connectDB();

  const now = options.now ?? new Date();
  const tolerance = options.toleranceMinutes ?? 60;

  const from = new Date(now.getTime() + (window.leadMinutes - tolerance) * 60_000);
  const to = new Date(now.getTime() + window.leadMinutes * 60_000);

  const assignments = await Assignment.find({
    status: "published",
    dueAt: { $gte: from, $lte: to },
  })
    .select("title dueAt targetSnapshot maxMarks")
    .lean();

  const result: SweepResult = {
    window: window.key,
    assignmentsChecked: assignments.length,
    notified: 0,
    skippedSubmitted: 0,
  };

  for (const assignment of assignments) {
    /**
     * The filter does the work, not a loop with an `if`.
     *
     * `status` excludes everyone who has handed in, and `remindersSent`
     * excludes everyone already reminded for this window — so what comes back
     * is exactly who should be notified, and a re-run returns nothing.
     */
    const pending = await AssignmentStudent.find({
      assignmentId: assignment._id,
      status: { $nin: ["submitted", "late", "graded"] },
      remindersSent: { $ne: window.key },
    })
      .select("studentId status")
      .lean();

    if (!pending.length) continue;

    const recipients = pending
      .filter((row) => !isSubmittedStatus(row.status as AssignmentStudentStatus))
      .map((row) => row.studentId);

    result.skippedSubmitted += pending.length - recipients.length;

    if (!recipients.length) continue;

    const sent = await notify({
      recipientIds: recipients,
      type: window.type,
      entityType: "assignment",
      entityId: assignment._id,
      data: {
        title: assignment.title,
        subjectName: assignment.targetSnapshot?.subjectName ?? null,
        teacherName: assignment.targetSnapshot?.teacherName ?? null,
        dueAt: assignment.dueAt ?? null,
      },
      batchId: `${window.key}:${String(assignment._id)}`,
    });

    /**
     * Marked after the send, not before.
     *
     * Marking first would lose the reminder entirely if the send failed;
     * marking after means a failure is retried on the next sweep, and a
     * duplicate is caught by the notification collection's unique index. Of
     * the two ways to be wrong, sending twice is much the better one.
     */
    await AssignmentStudent.updateMany(
      { assignmentId: assignment._id, studentId: { $in: recipients } },
      { $addToSet: { remindersSent: window.key } }
    );

    result.notified += sent.created;
  }

  return result;
}

/** Every window, for a single scheduled invocation. */
export async function sweepAllReminders(options: { now?: Date } = {}): Promise<SweepResult[]> {
  const results: SweepResult[] = [];

  for (const window of REMINDER_WINDOWS) {
    try {
      results.push(await sweepReminders(window, options));
    } catch (err) {
      console.error(`[reminders] ${window.key} failed:`, err);
      results.push({
        window: window.key,
        assignmentsChecked: 0,
        notified: 0,
        skippedSubmitted: 0,
      });
    }
  }

  return results;
}
