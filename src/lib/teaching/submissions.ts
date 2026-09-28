import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { HttpError } from "@/lib/api";
import {
  Assignment,
  AssignmentStudent,
  AssignmentSubmission,
} from "@/models/Assignment";
import { User } from "@/models/User";
import { notify } from "@/lib/notifications/service";
import {
  advanceAssignmentStudentStatus,
  isSubmittedStatus,
  submissionRequires,
  TEACHING_LIMITS,
  type AssignmentStudentStatus,
  type SubmissionType,
} from "@/lib/teaching/fields";
import type { TeacherContext } from "@/lib/teaching/teacher";
import type { AttachmentInput } from "@/lib/teaching/assignments";
import { claimAttachments } from "@/lib/teaching/attachments";

/**
 * Submitting and grading (§24, §44).
 *
 * The invariant this file exists to hold: **`AssignmentStudent` is the state,
 * `AssignmentSubmission` is the evidence.** Every write here moves both, in
 * that order, and the status never moves backwards — a student re-opening a
 * graded assignment must not drop it back to `viewed` and take a submission off
 * the teacher's count.
 */

// ── The student's own view of one assignment ──────────────────────────────

export type SubmissionWindow = {
  open: boolean;
  isLate: boolean;
  /** Why it is shut, in words a student can act on. */
  reason: string | null;
};

/**
 * Whether this student may submit right now, and whether it would count late.
 *
 * One function because three screens ask — the card, the detail page and the
 * submit endpoint — and a button that is enabled while the endpoint refuses is
 * the worst of the three possible disagreements.
 */
export function submissionWindow(assignment: {
  status?: string;
  dueAt?: Date | null;
  allowLateSubmission?: boolean;
  lateSubmissionUntil?: Date | null;
}): SubmissionWindow {
  const now = new Date();

  if (assignment.status === "closed") {
    return { open: false, isLate: false, reason: "This assignment has been closed." };
  }
  if (assignment.status !== "published") {
    return { open: false, isLate: false, reason: "This assignment is not open for submissions." };
  }

  if (!assignment.dueAt || now <= assignment.dueAt) {
    return { open: true, isLate: false, reason: null };
  }

  if (!assignment.allowLateSubmission) {
    return {
      open: false,
      isLate: true,
      reason: "The due date has passed and this assignment does not accept late submissions.",
    };
  }

  if (assignment.lateSubmissionUntil && now > assignment.lateSubmissionUntil) {
    return { open: false, isLate: true, reason: "The late submission window has closed." };
  }

  return { open: true, isLate: true, reason: null };
}

// ── Recording that a student looked ───────────────────────────────────────

/**
 * Mark an assignment viewed.
 *
 * Fire-and-forget from the detail page. Uses `advanceAssignmentStudentStatus`
 * so a graded assignment being re-read does not regress, and only increments
 * the assignment's `viewedCount` on the *first* view — otherwise "160 viewed"
 * would climb past the number of students who received it.
 */
export async function recordView(userId: string, assignmentId: string): Promise<void> {
  if (!Types.ObjectId.isValid(assignmentId)) return;

  try {
    await connectDB();

    const row = await AssignmentStudent.findOne({ assignmentId, studentId: userId })
      .select("status viewedAt")
      .lean();

    if (!row || row.viewedAt) return;

    await AssignmentStudent.updateOne(
      { assignmentId, studentId: userId },
      {
        $set: {
          viewedAt: new Date(),
          status: advanceAssignmentStudentStatus(
            row.status as AssignmentStudentStatus,
            "viewed"
          ),
        },
      }
    );

    await Assignment.updateOne({ _id: assignmentId }, { $inc: { viewedCount: 1 } });
  } catch (err) {
    // Engagement tracking must never fail the page it is describing.
    console.error("[submissions] could not record a view:", err);
  }
}

// ── Submitting (§26) ──────────────────────────────────────────────────────

export type SubmissionInput = {
  content?: string | null;
  language?: string | null;
  links?: string[];
  attachments?: AttachmentInput[];
};

export type SubmitResult = {
  submissionId: string;
  attemptNumber: number;
  isLate: boolean;
  status: AssignmentStudentStatus;
};

export async function submitAssignment(
  userId: string,
  assignmentId: string,
  input: SubmissionInput
): Promise<SubmitResult> {
  await connectDB();

  if (!Types.ObjectId.isValid(assignmentId)) {
    throw new HttpError(404, "That assignment could not be found.");
  }

  /**
   * The student's own row is the authorisation.
   *
   * Not "is this assignment for my branch" — that was decided at publish time
   * and materialised. A student who has changed branch keeps the work they were
   * given (§78), and a student who was never in the audience has no row and
   * therefore no way in. One lookup answers both.
   */
  const record = await AssignmentStudent.findOne({ assignmentId, studentId: userId }).lean();
  if (!record) throw new HttpError(404, "That assignment could not be found.");

  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) throw new HttpError(404, "That assignment could not be found.");

  const window = submissionWindow(assignment);
  if (!window.open) throw new HttpError(409, window.reason ?? "Submissions are closed.");

  const issues = validateSubmission(input, assignment.submissionType as SubmissionType);
  if (issues) throw new HttpError(422, issues);

  const attemptNumber = (record.attemptCount ?? 0) + 1;

  /**
   * Earlier attempts are superseded, not deleted.
   *
   * A disputed grade is unanswerable if the text the teacher marked no longer
   * exists, and §24 asks for multiple attempts to be supportable — which means
   * the history has to be real from the first version, not retrofitted.
   */
  if (record.submissionId) {
    await AssignmentSubmission.updateOne(
      { _id: record.submissionId },
      { $set: { status: "superseded" } }
    );
  }

  const submission = await AssignmentSubmission.create({
    assignmentId,
    studentId: userId,
    content: input.content?.trim() || null,
    language: input.language?.trim() || null,
    links: (input.links ?? []).filter(Boolean).slice(0, 10),
    attachments: [],
    submittedAt: new Date(),
    isLate: window.isLate,
    attemptNumber,
    status: "submitted",
  });

  const attachments = await claimAttachments({
    uploadedBy: userId,
    attachments: input.attachments,
    attachedToType: "submission",
    attachedToId: submission._id,
  });

  if (attachments.length) {
    await AssignmentSubmission.updateOne({ _id: submission._id }, { $set: { attachments } });
  }

  const status: AssignmentStudentStatus = window.isLate ? "late" : "submitted";
  const wasSubmitted = isSubmittedStatus(record.status as AssignmentStudentStatus);

  await AssignmentStudent.updateOne(
    { assignmentId, studentId: userId },
    {
      $set: {
        status,
        submittedAt: new Date(),
        submissionId: submission._id,
        // A resubmission clears the previous grade: the marks belonged to work
        // the teacher can no longer see at the top of the pile.
        ...(wasSubmitted ? { marks: null, feedback: null, gradedAt: null } : {}),
      },
      $inc: { attemptCount: 1 },
    }
  );

  /**
   * The roll-up only moves on the *first* submission.
   *
   * A student submitting three times is one submission in "137 of 184", and
   * incrementing per attempt would push the count past the audience.
   */
  if (!wasSubmitted) {
    await Assignment.updateOne(
      { _id: assignmentId },
      { $inc: { submittedCount: 1, ...(window.isLate ? { lateCount: 1 } : {}) } }
    );
  }

  return {
    submissionId: String(submission._id),
    attemptNumber,
    isLate: window.isLate,
    status,
  };
}

function validateSubmission(input: SubmissionInput, type: SubmissionType): string | null {
  const hasText = Boolean(input.content?.trim());
  const hasFile = (input.attachments?.length ?? 0) > 0;
  const hasLink = (input.links ?? []).some((link) => link.trim());

  if ((input.content?.length ?? 0) > TEACHING_LIMITS.submissionTextMax) {
    return "That submission is too long.";
  }

  if (type === "mixed") {
    return hasText || hasFile || hasLink
      ? null
      : "Add an answer, a file or a link before submitting.";
  }

  const required = submissionRequires(type);
  if (required.text && !hasText) return "Type your answer before submitting.";
  if (required.file && !hasFile) return "Attach your file before submitting.";
  if (required.link && !hasLink) return "Add your link before submitting.";

  return null;
}

// ── Grading (§44) ─────────────────────────────────────────────────────────

export type GradeInput = {
  marks: number | null;
  feedback?: string | null;
};

export async function gradeSubmission(
  teacher: TeacherContext,
  assignmentId: string,
  studentId: string,
  input: GradeInput
): Promise<{ marks: number | null; status: AssignmentStudentStatus }> {
  await connectDB();

  if (!Types.ObjectId.isValid(assignmentId) || !Types.ObjectId.isValid(studentId)) {
    throw new HttpError(404, "That submission could not be found.");
  }

  /**
   * The teacher must own the assignment (§94's fifth test).
   *
   * Both `teacherUserId` and `collegeId` are in the filter, so a teacher
   * reaching for a colleague's submission by id gets a 404 rather than a row.
   */
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  })
    .select("maxMarks title targetSnapshot")
    .lean();

  if (!assignment) throw new HttpError(404, "That assignment could not be found.");

  const record = await AssignmentStudent.findOne({ assignmentId, studentId }).lean();
  if (!record) throw new HttpError(404, "That student is not on this assignment.");

  if (!isSubmittedStatus(record.status as AssignmentStudentStatus)) {
    throw new HttpError(409, "That student has not submitted yet.");
  }

  if (input.marks !== null) {
    if (!Number.isFinite(input.marks) || input.marks < 0) {
      throw new HttpError(422, "Marks must be zero or more.");
    }
    if (assignment.maxMarks != null && input.marks > assignment.maxMarks) {
      throw new HttpError(422, `Marks cannot exceed ${assignment.maxMarks}.`);
    }
  }

  if ((input.feedback?.length ?? 0) > TEACHING_LIMITS.feedbackMax) {
    throw new HttpError(422, "That feedback is too long.");
  }

  const now = new Date();
  const wasGraded = record.status === "graded";

  await AssignmentStudent.updateOne(
    { assignmentId, studentId },
    {
      $set: {
        status: "graded",
        marks: input.marks,
        feedback: input.feedback?.trim() || null,
        gradedAt: now,
        gradedBy: teacher.userId,
      },
    }
  );

  if (record.submissionId) {
    await AssignmentSubmission.updateOne(
      { _id: record.submissionId },
      {
        $set: {
          status: "graded",
          marks: input.marks,
          feedback: input.feedback?.trim() || null,
          gradedBy: teacher.userId,
          gradedAt: now,
        },
      }
    );
  }

  if (!wasGraded) {
    await Assignment.updateOne({ _id: assignmentId }, { $inc: { gradedCount: 1 } });
  }

  /**
   * Notify on the first grade only.
   *
   * A teacher correcting a mark from 7 to 8 should not send the student a
   * second "your assignment has been graded" — and the deduplication index
   * would refuse it anyway, so sending it would be a silent no-op that looks
   * like it worked.
   */
  if (!wasGraded) {
    await notify({
      recipientIds: [studentId],
      type: "ASSIGNMENT_GRADED",
      entityType: "assignment",
      entityId: assignmentId,
      data: {
        title: assignment.title,
        subjectName: assignment.targetSnapshot?.subjectName ?? null,
        teacherName: teacher.name,
        marks: input.marks,
        maxMarks: assignment.maxMarks,
      },
    });
  }

  return { marks: input.marks, status: "graded" };
}

// ── The teacher's submission table (§43) ──────────────────────────────────

export type SubmissionRow = {
  studentId: string;
  name: string;
  email: string;
  status: AssignmentStudentStatus;
  submittedAt: string | null;
  isLate: boolean;
  attemptCount: number;
  marks: number | null;
  feedback: string | null;
  submissionId: string | null;
};

/**
 * Who is on this assignment, and where each of them stands.
 *
 * §45 is the constraint that shapes the projection: a teacher may see a
 * student's name, their identifier and their status on *this* assignment, and
 * nothing else. There is no phone number, no city, no other subject and no way
 * to reach a student who is not on this assignment — the query starts from
 * `AssignmentStudent`, so the student list is the audience rather than the
 * platform.
 */
export async function listSubmissions(
  teacher: TeacherContext,
  assignmentId: string,
  options: { status?: string | null; search?: string | null; limit?: number; skip?: number } = {}
): Promise<{ rows: SubmissionRow[]; total: number }> {
  await connectDB();

  if (!Types.ObjectId.isValid(assignmentId)) return { rows: [], total: 0 };

  const assignment = await Assignment.findOne({
    _id: assignmentId,
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  })
    .select("_id")
    .lean();

  if (!assignment) throw new HttpError(404, "That assignment could not be found.");

  const filter: Record<string, unknown> = { assignmentId };

  if (options.status && options.status !== "all") {
    if (options.status === "pending") {
      filter.status = { $in: ["assigned", "viewed", "in_progress"] };
    } else if (options.status === "submitted") {
      filter.status = { $in: ["submitted", "late"] };
    } else {
      filter.status = options.status;
    }
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const skip = Math.max(options.skip ?? 0, 0);

  const [records, total] = await Promise.all([
    AssignmentStudent.find(filter)
      .sort({ submittedAt: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AssignmentStudent.countDocuments(filter),
  ]);

  if (!records.length) return { rows: [], total };

  const [students, submissions] = await Promise.all([
    User.find({ _id: { $in: records.map((row) => row.studentId) } })
      .select("name email")
      .lean(),
    AssignmentSubmission.find({
      _id: { $in: records.map((row) => row.submissionId).filter(Boolean) },
    })
      .select("isLate")
      .lean(),
  ]);

  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const submissionById = new Map(submissions.map((row) => [String(row._id), row]));

  let rows: SubmissionRow[] = records.map((record) => {
    const student = studentById.get(String(record.studentId));
    const submission = record.submissionId
      ? submissionById.get(String(record.submissionId))
      : null;

    return {
      studentId: String(record.studentId),
      name: student?.name ?? "(account removed)",
      email: student?.email ?? "",
      status: record.status as AssignmentStudentStatus,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      isLate: submission?.isLate === true || record.status === "late",
      attemptCount: record.attemptCount ?? 0,
      marks: record.marks ?? null,
      feedback: record.feedback ?? null,
      submissionId: record.submissionId ? String(record.submissionId) : null,
    };
  });

  /**
   * Search filters the page in memory rather than the query.
   *
   * The name lives on `User` and the page lives on `AssignmentStudent`; a
   * server-side search across both would be an aggregation with a `$lookup` on
   * every keystroke. A cohort is a few hundred rows and a teacher searching is
   * looking for one student they can already see — so this narrows what was
   * fetched, and the UI says it is filtering the current page.
   */
  if (options.search?.trim()) {
    const needle = options.search.trim().toLowerCase();
    rows = rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle)
    );
  }

  return { rows, total };
}

/** One submission, in full, for the grading panel. */
export async function getSubmission(
  teacher: TeacherContext,
  assignmentId: string,
  studentId: string
) {
  await connectDB();

  if (!Types.ObjectId.isValid(assignmentId) || !Types.ObjectId.isValid(studentId)) return null;

  const assignment = await Assignment.findOne({
    _id: assignmentId,
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  })
    .select("title maxMarks submissionType")
    .lean();

  if (!assignment) return null;

  const [record, attempts, student] = await Promise.all([
    AssignmentStudent.findOne({ assignmentId, studentId }).lean(),
    AssignmentSubmission.find({ assignmentId, studentId })
      .sort({ attemptNumber: -1 })
      .limit(5)
      .lean(),
    User.findById(studentId).select("name email").lean(),
  ]);

  if (!record) return null;

  return {
    assignment: {
      id: String(assignment._id),
      title: assignment.title,
      maxMarks: assignment.maxMarks ?? null,
      submissionType: assignment.submissionType,
    },
    student: {
      id: studentId,
      name: student?.name ?? "(account removed)",
      email: student?.email ?? "",
    },
    status: record.status,
    marks: record.marks ?? null,
    feedback: record.feedback ?? null,
    attempts: attempts.map((attempt) => ({
      id: String(attempt._id),
      attemptNumber: attempt.attemptNumber,
      content: attempt.content ?? null,
      language: attempt.language ?? null,
      links: attempt.links ?? [],
      attachments: (attempt.attachments ?? []).map((file) => ({
        fileId: String(file.fileId),
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
      })),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      isLate: attempt.isLate,
      status: attempt.status,
    })),
  };
}
