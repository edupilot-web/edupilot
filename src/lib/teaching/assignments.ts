import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { AcademicYear } from "@/models/AcademicStructure";
import { Assignment, AssignmentStudent } from "@/models/Assignment";
import { Topic } from "@/models/Topic";
import { BackgroundJob } from "@/models/SystemModels";
import { notify } from "@/lib/notifications/service";
import { resolveAudience, type AudienceResult } from "@/lib/teaching/audience";
import { claimAttachments, releaseAttachments } from "@/lib/teaching/attachments";
import {
  canTransitionAssignment,
  TEACHING_LIMITS,
  type AssignmentStatus,
  type SubmissionType,
} from "@/lib/teaching/fields";
import type { AuthorizedSubject, TeacherContext } from "@/lib/teaching/teacher";

/**
 * AssignmentService — creating, publishing and closing work (§17, §60).
 *
 * The publish pipeline is the whole of §60, in order:
 *
 *   authorise the teacher → authorise the subject → validate the assignment →
 *   resolve the audience → snapshot the target → materialise one row per
 *   student → queue notifications → audit
 *
 * Two things are deliberately **not** in the background. The `AssignmentStudent`
 * rows are written inside the request, because they are what the student's own
 * list reads from — publishing and then telling the teacher it worked while the
 * students cannot yet see it would be a lie with a race attached. The audience
 * resolution is inside the request for the same reason: the count the teacher
 * was shown must be the count that was published to.
 *
 * What *is* deferred is the notification fan-out (§17, §62), which nothing
 * depends on for correctness — a student who never gets the prompt still finds
 * the assignment in their list.
 */

// ── Validation (§84) ──────────────────────────────────────────────────────

/**
 * An attachment as a *caller* supplies it, with `fileId` as a string.
 *
 * Distinct from the stored subdocument, where `fileId` is an ObjectId. The two
 * are converted at the boundary by `toAttachmentInput` rather than being loosely
 * typed as "either", so nothing downstream has to ask which shape it holds.
 */
export type AttachmentInput = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

/** Stored attachments, back into the input shape, for a merge on edit. */
export function toAttachmentInput(
  stored: { fileId: unknown; fileName: string; mimeType: string; size: number }[] | undefined
): AttachmentInput[] {
  return (stored ?? []).map((file) => ({
    fileId: String(file.fileId),
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.size,
  }));
}

export type AssignmentInput = {
  subjectId: string;
  topicId?: string | null;
  title: string;
  description?: string | null;
  instructions?: string | null;
  submissionType: SubmissionType;
  maxMarks?: number | null;
  dueAt?: Date | null;
  allowLateSubmission?: boolean;
  lateSubmissionUntil?: Date | null;
  attachments?: AttachmentInput[];
};

export type ValidationIssue = { field: string; message: string };

/**
 * Check an assignment before it is written.
 *
 * Returns every problem rather than the first, so a teacher fixes one form
 * instead of resubmitting five times.
 */
export function validateAssignment(
  input: AssignmentInput,
  options: { forPublish: boolean }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const title = input.title?.trim() ?? "";
  if (title.length < 3) {
    issues.push({ field: "title", message: "Give the assignment a title." });
  } else if (title.length > TEACHING_LIMITS.titleMax) {
    issues.push({ field: "title", message: `Keep the title under ${TEACHING_LIMITS.titleMax} characters.` });
  }

  if ((input.description?.length ?? 0) > TEACHING_LIMITS.descriptionMax) {
    issues.push({ field: "description", message: "That description is too long." });
  }
  if ((input.instructions?.length ?? 0) > TEACHING_LIMITS.instructionsMax) {
    issues.push({ field: "instructions", message: "Those instructions are too long." });
  }

  if (input.maxMarks !== null && input.maxMarks !== undefined) {
    if (!Number.isFinite(input.maxMarks) || input.maxMarks < 0) {
      issues.push({ field: "maxMarks", message: "Marks must be zero or more." });
    } else if (input.maxMarks > TEACHING_LIMITS.maxMarksMax) {
      issues.push({ field: "maxMarks", message: `Marks cannot exceed ${TEACHING_LIMITS.maxMarksMax}.` });
    }
  }

  if ((input.attachments?.length ?? 0) > TEACHING_LIMITS.maxAttachmentsPerItem) {
    issues.push({
      field: "attachments",
      message: `Attach at most ${TEACHING_LIMITS.maxAttachmentsPerItem} files.`,
    });
  }

  if (input.dueAt) {
    const limit = new Date();
    limit.setFullYear(limit.getFullYear() + TEACHING_LIMITS.dueDateMaxYearsAhead);
    if (input.dueAt > limit) {
      // Catches the "2027 for 2026" typo, which would otherwise pin the row to
      // the top of every student's "due soon" list indefinitely.
      issues.push({ field: "dueAt", message: "That due date is too far in the future." });
    }
  }

  if (input.allowLateSubmission && input.lateSubmissionUntil && input.dueAt) {
    if (input.lateSubmissionUntil <= input.dueAt) {
      issues.push({
        field: "lateSubmissionUntil",
        message: "The late cut-off must be after the due date.",
      });
    }
  }

  /**
   * Publishing asks for more than saving a draft.
   *
   * A draft is a teacher's own working state and may be as incomplete as they
   * like; a published assignment with no due date is one no student can plan
   * around, and one with no instructions is one they will all email about.
   */
  if (options.forPublish) {
    if (!input.dueAt) {
      issues.push({ field: "dueAt", message: "Set a due date before publishing." });
    } else if (input.dueAt.getTime() < Date.now()) {
      issues.push({ field: "dueAt", message: "The due date has already passed." });
    }

    if (!input.instructions?.trim() && !input.description?.trim()) {
      issues.push({
        field: "instructions",
        message: "Add instructions or a description so students know what to do.",
      });
    }
  }

  return issues;
}

// ── Create and edit ───────────────────────────────────────────────────────

export async function createAssignment(
  teacher: TeacherContext,
  subject: AuthorizedSubject,
  input: AssignmentInput
): Promise<{ id: string }> {
  const issues = validateAssignment(input, { forPublish: false });
  if (issues.length) throw new ValidationError(issues);

  await connectDB();

  const topicId = await resolveTopic(input.topicId, subject.subjectId);

  const created = await Assignment.create({
    teacherId: teacher.teacherProfileId,
    teacherUserId: teacher.userId,

    /**
     * Every academic field comes from the **authorised subject**, never from
     * the request (§77, §10). The body carries a `subjectId` and nothing else
     * academic, so there is no id a caller could supply that would file work
     * under another college, branch or regulation.
     */
    collegeId: subject.collegeId,
    programId: subject.programId,
    branchId: subject.branchId,
    regulationId: subject.regulationId,
    year: subject.year,
    semester: subject.semester,
    subjectId: subject.subjectId,
    topicId,
    admissionYear: subject.admissionYear,

    title: input.title.trim(),
    description: input.description?.trim() || null,
    instructions: input.instructions?.trim() || null,
    attachments: [],
    submissionType: input.submissionType,
    maxMarks: input.maxMarks ?? null,
    dueAt: input.dueAt ?? null,
    allowLateSubmission: input.allowLateSubmission ?? false,
    lateSubmissionUntil: input.lateSubmissionUntil ?? null,
    status: "draft",
  });

  /**
   * Attachments are claimed *after* the row exists, because claiming records
   * what the file belongs to and that id does not exist until now. The stored
   * metadata comes back from the claim rather than from the request, so a
   * client cannot relabel a file it did not upload.
   */
  const attachments = await claimAttachments({
    uploadedBy: teacher.userId,
    attachments: input.attachments,
    attachedToType: "assignment",
    attachedToId: created._id,
  });

  if (attachments.length) {
    await Assignment.updateOne({ _id: created._id }, { $set: { attachments } });
  }

  return { id: String(created._id) };
}

export type EditOutcome = {
  id: string;
  /** Set when a published assignment changed in a way students must hear about. */
  notifiedStudents: number;
};

/**
 * Edit an assignment.
 *
 * A draft may change freely. A published one may change too — §79 expects it —
 * but the academic target may not: re-pointing published work at a different
 * subject would leave `AssignmentStudent` rows for an audience that no longer
 * matches, and the students holding them with no way to understand why.
 *
 * Material changes notify; cosmetic ones do not (§79). The line is drawn at
 * what a student would have to *act* on: the deadline, the instructions and the
 * attachments change what they must do, so those are announced. A corrected
 * typo in the title is not.
 */
export async function updateAssignment(
  teacher: TeacherContext,
  assignmentId: string,
  input: Partial<AssignmentInput>
): Promise<EditOutcome> {
  await connectDB();

  const existing = await ownedAssignment(teacher, assignmentId);

  if (existing.status === "archived") {
    throw new HttpError(409, "An archived assignment cannot be edited.");
  }

  const merged: AssignmentInput = {
    subjectId: String(existing.subjectId),
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    instructions: input.instructions ?? existing.instructions,
    submissionType: (input.submissionType ?? existing.submissionType) as SubmissionType,
    maxMarks: input.maxMarks ?? existing.maxMarks,
    dueAt: input.dueAt ?? existing.dueAt,
    allowLateSubmission: input.allowLateSubmission ?? existing.allowLateSubmission,
    lateSubmissionUntil: input.lateSubmissionUntil ?? existing.lateSubmissionUntil,
    attachments: input.attachments ?? toAttachmentInput(existing.attachments),
  };

  const published = existing.status === "published" || existing.status === "closed";
  const issues = validateAssignment(merged, { forPublish: published });
  if (issues.length) throw new ValidationError(issues);

  const deadlineMoved =
    input.dueAt !== undefined &&
    input.dueAt?.getTime() !== existing.dueAt?.getTime();

  const instructionsChanged =
    input.instructions !== undefined && input.instructions !== existing.instructions;

  /**
   * The attachments are claimed before the change is measured, because what
   * counts as "changed" is what was actually *stored* — a request listing five
   * file ids of which two belong to somebody else attaches three, and notifying
   * students about five would be describing a state that does not exist.
   */
  const claimed =
    input.attachments !== undefined
      ? await claimAttachments({
          uploadedBy: teacher.userId,
          attachments: input.attachments,
          attachedToType: "assignment",
          attachedToId: existing._id,
        })
      : null;

  if (claimed) {
    await releaseAttachments({
      attachedToType: "assignment",
      attachedToId: existing._id,
      keepFileIds: claimed.map((file) => file.fileId),
    });
  }

  const attachmentsChanged =
    claimed !== null && claimed.length !== (existing.attachments?.length ?? 0);

  const update: Record<string, unknown> = {
    title: merged.title.trim(),
    description: merged.description?.trim() || null,
    instructions: merged.instructions?.trim() || null,
    submissionType: merged.submissionType,
    maxMarks: merged.maxMarks ?? null,
    dueAt: merged.dueAt ?? null,
    allowLateSubmission: merged.allowLateSubmission ?? false,
    lateSubmissionUntil: merged.lateSubmissionUntil ?? null,
    ...(claimed ? { attachments: claimed } : {}),
  };

  await Assignment.updateOne({ _id: existing._id }, { $set: update });

  // The students' own copies carry the deadline for their list ordering, so a
  // moved deadline has to reach them too or the list sorts on a stale date.
  if (deadlineMoved) {
    await AssignmentStudent.updateMany(
      { assignmentId: existing._id },
      { $set: { dueAt: merged.dueAt ?? null } }
    );
  }

  let notifiedStudents = 0;

  if (published && (deadlineMoved || instructionsChanged || attachmentsChanged)) {
    const recipients = await AssignmentStudent.find({ assignmentId: existing._id })
      .select("studentId")
      .lean();

    const result = await notify({
      recipientIds: recipients.map((row) => row.studentId),
      type: "ASSIGNMENT_UPDATED",
      entityType: "assignment",
      entityId: existing._id,
      data: {
        title: merged.title,
        subjectName: existing.targetSnapshot?.subjectName ?? null,
        teacherName: teacher.name,
        dueAt: merged.dueAt ?? null,
      },
    });

    notifiedStudents = result.created;
    await Assignment.updateOne({ _id: existing._id }, { $set: { lastNotifiedAt: new Date() } });
  }

  return { id: String(existing._id), notifiedStudents };
}

// ── Publish (§17, §60) ────────────────────────────────────────────────────

export type PublishResult = {
  id: string;
  eligibleStudents: number;
  audience: AudienceResult["skipped"];
  batchId: string;
  /** Set when nobody matched — a success the teacher must still be told about. */
  warning: string | null;
};

export async function publishAssignment(
  teacher: TeacherContext,
  subject: AuthorizedSubject,
  assignmentId: string
): Promise<PublishResult> {
  await connectDB();

  const assignment = await ownedAssignment(teacher, assignmentId);

  if (!canTransitionAssignment(assignment.status as AssignmentStatus, "published")) {
    throw new HttpError(
      409,
      `An assignment that is ${assignment.status} cannot be published.`
    );
  }

  /**
   * Re-validated at publish time, against the *stored* document.
   *
   * The draft may have been saved weeks ago and its due date may now be in the
   * past; validating only on the way in would let that through.
   */
  const issues = validateAssignment(
    {
      subjectId: String(assignment.subjectId),
      title: assignment.title,
      description: assignment.description,
      instructions: assignment.instructions,
      submissionType: assignment.submissionType as SubmissionType,
      maxMarks: assignment.maxMarks,
      dueAt: assignment.dueAt,
      allowLateSubmission: assignment.allowLateSubmission,
      lateSubmissionUntil: assignment.lateSubmissionUntil,
      attachments: toAttachmentInput(assignment.attachments),
    },
    { forPublish: true }
  );
  if (issues.length) throw new ValidationError(issues);

  // ── Resolve the audience (§18) ──────────────────────────────────────────
  const audience = await resolveAudience({
    collegeId: subject.collegeId,
    programId: subject.programId,
    branchId: subject.branchId,
    regulationId: subject.regulationId,
    semester: subject.semester,
    admissionYear: subject.admissionYear,
  });

  const snapshot = await buildSnapshot({
    teacher,
    subject,
    topicId: assignment.topicId,
    academicYearId: assignment.academicYearId,
    eligibleStudentCount: audience.count,
  });

  const batchId = randomUUID();
  const now = new Date();

  await Assignment.updateOne(
    { _id: assignment._id },
    {
      $set: {
        status: "published",
        publishedAt: now,
        targetSnapshot: snapshot,
        assignedCount: audience.count,
        academicYearId: snapshot.academicYearId ?? assignment.academicYearId ?? null,
      },
    }
  );

  /**
   * One row per recipient, in chunks (§62).
   *
   * `insertOne` with `ordered: false` rather than an upsert: the unique index
   * on `(assignmentId, studentId)` makes a re-publish a no-op per row, and an
   * upsert would instead *reset* a student's status — turning a retried publish
   * into a way to erase submissions.
   */
  await materialiseRecipients({
    assignmentId: assignment._id,
    subjectId: assignment.subjectId,
    collegeId: assignment.collegeId,
    dueAt: assignment.dueAt,
    studentIds: audience.members.map((member) => member.userId),
  });

  /**
   * The notification fan-out is the caller's to defer.
   *
   * Returned rather than awaited here so the route can hand it to `after()` —
   * the service stays testable and synchronous, and the decision about what
   * runs inside the request stays where the request budget is known.
   */
  await recordPublishJob({
    type: "assignment-notifications",
    label: `${snapshot.subjectCode ?? ""} ${assignment.title}`.trim(),
    payload: { assignmentId: String(assignment._id), recipients: audience.count, batchId },
  });

  return {
    id: String(assignment._id),
    eligibleStudents: audience.count,
    audience: audience.skipped,
    batchId,
    /**
     * Publishing to nobody succeeds and says so (§78).
     *
     * Refusing would be worse: the assignment is valid, the teacher meant it,
     * and the usual cause is a cohort that has moved on — which they can only
     * diagnose if the publish tells them rather than erroring.
     */
    warning:
      audience.count === 0
        ? "No students currently match this subject's year and semester, so nobody was notified. The assignment is published and will not reach anyone until students in that cohort exist."
        : null,
  };
}

/**
 * Send the notifications for a published assignment.
 *
 * Separate from `publishAssignment` so the route can run it through `after()`.
 * Idempotent: the unique index on the notification collection means running it
 * twice sends nothing the second time.
 */
export async function notifyAssignmentPublished(
  assignmentId: string,
  batchId?: string | null
): Promise<number> {
  await connectDB();

  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment || assignment.status !== "published") return 0;

  const recipients = await AssignmentStudent.find({ assignmentId: assignment._id })
    .select("studentId")
    .lean();

  if (!recipients.length) return 0;

  const result = await notify({
    recipientIds: recipients.map((row) => row.studentId),
    type: "ASSIGNMENT_PUBLISHED",
    entityType: "assignment",
    entityId: assignment._id,
    data: {
      title: assignment.title,
      subjectName: assignment.targetSnapshot?.subjectName ?? null,
      teacherName: assignment.targetSnapshot?.teacherName ?? null,
      dueAt: assignment.dueAt ?? null,
    },
    batchId: batchId ?? null,
  });

  return result.created;
}

// ── Close and archive ─────────────────────────────────────────────────────

export async function transitionAssignment(
  teacher: TeacherContext,
  assignmentId: string,
  to: AssignmentStatus
): Promise<{ id: string; status: AssignmentStatus }> {
  await connectDB();

  const assignment = await ownedAssignment(teacher, assignmentId);
  const from = assignment.status as AssignmentStatus;

  if (!canTransitionAssignment(from, to)) {
    throw new HttpError(409, `An assignment that is ${from} cannot become ${to}.`);
  }

  const now = new Date();

  await Assignment.updateOne(
    { _id: assignment._id },
    {
      $set: {
        status: to,
        ...(to === "closed" ? { closedAt: now } : {}),
        ...(to === "archived" ? { archivedAt: now } : {}),
        // Re-opening clears the close, so the UI does not show a closed date on
        // something that is open.
        ...(to === "published" && from === "closed" ? { closedAt: null } : {}),
      },
    }
  );

  return { id: String(assignment._id), status: to };
}

// ── Shared helpers ────────────────────────────────────────────────────────

export class ValidationError extends HttpError {
  constructor(readonly issues: ValidationIssue[]) {
    super(422, issues[0]?.message ?? "That assignment is not valid.");
  }
}

/**
 * The assignment, if it belongs to this teacher.
 *
 * `teacherUserId` **and** `collegeId` are both in the filter. The second is
 * redundant while a teacher has one college, and it is the check that keeps
 * being correct if that ever stops being true — §66 asks for both, and the
 * cost is nothing.
 */
async function ownedAssignment(teacher: TeacherContext, assignmentId: string) {
  if (!Types.ObjectId.isValid(assignmentId)) {
    throw new HttpError(404, "That assignment could not be found.");
  }

  const assignment = await Assignment.findOne({
    _id: assignmentId,
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  }).lean();

  if (!assignment) throw new HttpError(404, "That assignment could not be found.");
  return assignment;
}

async function resolveTopic(
  topicId: string | null | undefined,
  subjectId: string
): Promise<Types.ObjectId | null> {
  if (!topicId || !Types.ObjectId.isValid(topicId)) return null;

  // The topic must belong to the subject the work is for, or the curriculum
  // link on the topic page would point at an assignment from another subject.
  const topic = await Topic.findOne({ _id: topicId, subjectId }).select("_id").lean();
  return topic?._id ?? null;
}

async function buildSnapshot(input: {
  teacher: TeacherContext;
  subject: AuthorizedSubject;
  topicId?: Types.ObjectId | null;
  academicYearId?: Types.ObjectId | null;
  eligibleStudentCount: number;
}) {
  const [topic, academicYear] = await Promise.all([
    input.topicId ? Topic.findById(input.topicId).select("title").lean() : null,
    input.academicYearId
      ? AcademicYear.findById(input.academicYearId).select("label").lean()
      : AcademicYear.findOne({ isCurrent: true }).select("label").lean(),
  ]);

  return {
    collegeName: input.teacher.collegeName,
    programName: input.subject.programName,
    branchName: input.subject.branchName,
    regulationCode: input.subject.regulationCode,
    academicYearLabel: academicYear?.label ?? null,
    academicYearId: academicYear?._id ?? null,
    batchLabel: input.subject.admissionYear ? `${input.subject.admissionYear} intake` : null,
    yearLabel: `Year ${input.subject.year}`,
    semesterLabel: `Semester ${input.subject.semester}`,
    subjectName: input.subject.name,
    subjectCode: input.subject.code,
    topicTitle: topic?.title ?? null,
    teacherName: input.teacher.name,
    eligibleStudentCount: input.eligibleStudentCount,
  };
}

const RECIPIENT_CHUNK = 500;

export async function materialiseRecipients(input: {
  assignmentId: Types.ObjectId;
  subjectId: Types.ObjectId;
  collegeId: Types.ObjectId;
  dueAt: Date | null | undefined;
  studentIds: Types.ObjectId[];
}): Promise<number> {
  let created = 0;

  for (let index = 0; index < input.studentIds.length; index += RECIPIENT_CHUNK) {
    const chunk = input.studentIds.slice(index, index + RECIPIENT_CHUNK);

    const operations = chunk.map((studentId) => ({
      insertOne: {
        document: {
          assignmentId: input.assignmentId,
          studentId,
          subjectId: input.subjectId,
          collegeId: input.collegeId,
          dueAt: input.dueAt ?? null,
          status: "assigned" as const,
          attemptCount: 0,
          remindersSent: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    }));

    try {
      const written = await AssignmentStudent.bulkWrite(operations, { ordered: false });
      created += written.insertedCount ?? 0;
    } catch (err) {
      // Duplicates are the expected outcome of a retried publish, and the
      // successes come back attached to the rejection.
      const error = err as { insertedCount?: number };
      created += error.insertedCount ?? 0;
    }
  }

  return created;
}

/**
 * A row in the existing `BackgroundJob` collection, for visibility.
 *
 * The work itself runs through `after()` — the same mechanism the AI module
 * uses, and the one that fits a platform with no worker process. This row is
 * how an operator sees that a fan-out happened and how big it was, which
 * `after()` alone does not record anywhere.
 */
async function recordPublishJob(input: {
  type: string;
  label: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await BackgroundJob.create({
      type: input.type,
      label: input.label.slice(0, 160),
      status: "queued",
      payload: input.payload,
    });
  } catch (err) {
    // Bookkeeping must never fail a publish.
    console.error("[assignments] could not record the publish job:", err);
  }
}

export async function completePublishJob(
  batchId: string,
  outcome: { notified: number; failed?: boolean; error?: string }
): Promise<void> {
  try {
    await BackgroundJob.updateOne(
      { "payload.batchId": batchId },
      {
        $set: {
          status: outcome.failed ? "failed" : "completed",
          finishedAt: new Date(),
          result: { notified: outcome.notified },
          errorMessage: outcome.error?.slice(0, 1000) ?? null,
        },
      }
    );
  } catch (err) {
    console.error("[assignments] could not complete the publish job:", err);
  }
}
