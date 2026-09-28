import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { attachmentSchema } from "@/models/StoredFile";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STUDENT_STATUSES,
  SUBMISSION_TYPES,
  TEACHING_LIMITS,
} from "@/lib/teaching/fields";

/**
 * Assignments: the work a teacher sets, who it reached, and what came back.
 *
 *   Assignment                 what was set, and the audience it was set for
 *     ├── AssignmentStudent    one row per recipient — the teacher's dashboard
 *     └── AssignmentSubmission one row per attempt — what the student handed in
 *
 * The three-way split is §23's, and it earns its keep. `AssignmentStudent`
 * exists so "137 of 184 submitted" is a `countDocuments` on an index rather
 * than a join between every enrolled student and every submission, recomputed
 * on every dashboard load. `AssignmentSubmission` is separate from it because a
 * student may submit more than once and the *state* must survive the attempts.
 */

/**
 * The academic coordinate, denormalised onto the assignment.
 *
 * Shared with `Note` through this factory rather than written twice — the two
 * are targeted identically, and two copies of an eight-field coordinate is two
 * chances to omit `regulationId` from one of them.
 */
function academicTarget() {
  return {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", required: true },
    /** The academic year the work was set *in*, for reporting by session. */
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", default: null },
    year: { type: Number, required: true, min: 1, max: 8 },
    semester: { type: Number, required: true, min: 1, max: 16 },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "CurriculumSubject",
      required: true,
      index: true,
    },
    /** Optional, and the hook for §51's curriculum integration. */
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null, index: true },
    /**
     * One cohort, or null for "whoever is in that semester now" (§19).
     *
     * Null is the normal case and the one the specification describes: a
     * teacher picks Year 2 Semester 1, and the audience is resolved from the
     * students who are *currently* there. A value pins the work to one
     * admission year.
     */
    admissionYear: { type: Number, default: null, min: 1980, max: 2100 },
  };
}

/**
 * What the coordinate meant at the moment of publishing (§20).
 *
 * Names, not ids. The ids above stay the join; this is what the screen renders
 * and what a historical record shows after a college renames a branch or a
 * regulation is superseded. Without it, last year's assignment would silently
 * re-label itself with this year's vocabulary, and a student looking at their
 * own history would see something they never received.
 */
const targetSnapshotSchema = new Schema(
  {
    collegeName: { type: String, default: null, maxlength: 200 },
    programName: { type: String, default: null, maxlength: 200 },
    branchName: { type: String, default: null, maxlength: 160 },
    regulationCode: { type: String, default: null, maxlength: 20 },
    academicYearLabel: { type: String, default: null, maxlength: 20 },
    batchLabel: { type: String, default: null, maxlength: 40 },
    yearLabel: { type: String, default: null, maxlength: 40 },
    semesterLabel: { type: String, default: null, maxlength: 40 },
    subjectName: { type: String, default: null, maxlength: 300 },
    subjectCode: { type: String, default: null, maxlength: 24 },
    topicTitle: { type: String, default: null, maxlength: 300 },
    teacherName: { type: String, default: null, maxlength: 120 },
    /** How many students it reached. The denominator on every later figure. */
    eligibleStudentCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

export type TargetSnapshot = InferSchemaType<typeof targetSnapshotSchema>;

// ── Assignment ────────────────────────────────────────────────────────────

const assignmentSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "TeacherProfile", required: true, index: true },
    /** The `User` row, so a session authorises without a profile lookup. */
    teacherUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    ...academicTarget(),

    title: { type: String, required: true, trim: true, maxlength: TEACHING_LIMITS.titleMax },
    description: { type: String, default: null, maxlength: TEACHING_LIMITS.descriptionMax },
    instructions: { type: String, default: null, maxlength: TEACHING_LIMITS.instructionsMax },

    attachments: { type: [attachmentSchema], default: [] },

    submissionType: { type: String, enum: SUBMISSION_TYPES, default: "text" },
    maxMarks: { type: Number, default: null, min: 0, max: TEACHING_LIMITS.maxMarksMax },

    dueAt: { type: Date, default: null, index: true },

    allowLateSubmission: { type: Boolean, default: false },
    /**
     * The hard deadline for a late submission.
     *
     * Separate from `allowLateSubmission` because "late is allowed" and "late
     * is allowed until Friday" are different policies, and a boolean alone
     * leaves an assignment open forever. Null with the flag on means exactly
     * that — open until the assignment is closed — which is a deliberate
     * choice a teacher makes, not an oversight.
     */
    lateSubmissionUntil: { type: Date, default: null },

    status: { type: String, enum: ASSIGNMENT_STATUSES, default: "draft", index: true },
    /** When a `scheduled` assignment should go out. */
    scheduledFor: { type: Date, default: null },

    targetSnapshot: { type: targetSnapshotSchema, default: null },

    // ── Roll-ups, kept by the writers (§42) ───────────────────────────────
    /**
     * Counters rather than aggregations.
     *
     * The teacher's list shows six numbers per assignment. Computing them with
     * a `$group` over `AssignmentStudent` per row is fine for one assignment
     * and is twelve aggregations for a page of ten. They are incremented by the
     * same code that moves a student's status, so they cannot drift without a
     * bug in exactly one place.
     */
    assignedCount: { type: Number, default: 0, min: 0 },
    viewedCount: { type: Number, default: 0, min: 0 },
    submittedCount: { type: Number, default: 0, min: 0 },
    lateCount: { type: Number, default: 0, min: 0 },
    gradedCount: { type: Number, default: 0, min: 0 },

    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    /** Bumped when a published assignment is materially edited (§79). */
    lastNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** §76's indexes. */
assignmentSchema.index({ teacherUserId: 1, createdAt: -1 });
assignmentSchema.index({ collegeId: 1, semester: 1, subjectId: 1, status: 1 });
assignmentSchema.index({ collegeId: 1, status: 1, dueAt: 1 });
/** The reminder sweep: published work with a due date coming up (§80). */
assignmentSchema.index({ status: 1, dueAt: 1 });
assignmentSchema.index({ title: "text" });

export type AssignmentDoc = InferSchemaType<typeof assignmentSchema>;

resetModelInDev("Assignment");

export const Assignment: Model<AssignmentDoc> =
  (mongoose.models.Assignment as Model<AssignmentDoc>) ||
  mongoose.model<AssignmentDoc>("Assignment", assignmentSchema);

// ── Per-student record (§23) ──────────────────────────────────────────────

/**
 * One row per student per published assignment.
 *
 * Created in bulk at publish time, not computed on read. That is the whole
 * point: without it, "has this student submitted?" is a lookup in
 * `AssignmentSubmission` for every student on every dashboard load, and
 * "which students have *not*" cannot be answered at all without materialising
 * the audience again — by which time the audience may have changed.
 *
 * Materialising it also settles §19 honestly. The rows record who the work was
 * set for *at the time*; a student who moves from Year 2 to Year 3 keeps the
 * assignments they were given and stops receiving new Year 2 ones, which is
 * exactly what the specification asks for.
 */
const assignmentStudentSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /**
     * Denormalised so the student's own list is one query.
     *
     * Their assignments page filters on `studentId` and sorts by `dueAt`; going
     * back to the assignment for the subject and the deadline would be a join
     * per row on the most-visited screen in the module.
     */
    subjectId: { type: Schema.Types.ObjectId, ref: "CurriculumSubject", required: true },
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true },
    dueAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ASSIGNMENT_STUDENT_STATUSES,
      default: "assigned",
      index: true,
    },

    viewedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },

    /** The current submission. Earlier attempts stay in their own collection. */
    submissionId: { type: Schema.Types.ObjectId, ref: "AssignmentSubmission", default: null },
    attemptCount: { type: Number, default: 0, min: 0 },

    marks: { type: Number, default: null, min: 0 },
    feedback: { type: String, default: null, maxlength: TEACHING_LIMITS.feedbackMax },
    gradedAt: { type: Date, default: null },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    /** Which reminders have already gone out, so none is sent twice (§80). */
    remindersSent: { type: [String], default: [] },
  },
  { timestamps: true }
);

/** One row per student per assignment — a second is a double-publish (§76). */
assignmentStudentSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });
/** The student's own list, and its status tabs. */
assignmentStudentSchema.index({ studentId: 1, status: 1, dueAt: 1 });
assignmentStudentSchema.index({ studentId: 1, createdAt: -1 });
/** The teacher's submission table, filtered and sorted. */
assignmentStudentSchema.index({ assignmentId: 1, status: 1, submittedAt: -1 });
/** The reminder sweep: who has not submitted, on work due soon. */
assignmentStudentSchema.index({ dueAt: 1, status: 1 });

export type AssignmentStudentDoc = InferSchemaType<typeof assignmentStudentSchema>;

resetModelInDev("AssignmentStudent");

export const AssignmentStudent: Model<AssignmentStudentDoc> =
  (mongoose.models.AssignmentStudent as Model<AssignmentStudentDoc>) ||
  mongoose.model<AssignmentStudentDoc>("AssignmentStudent", assignmentStudentSchema);

// ── Submission (§24) ──────────────────────────────────────────────────────

/**
 * One attempt.
 *
 * Append-only: a resubmission writes a new row with a higher `attemptNumber`
 * rather than overwriting the last one. §24 asks for multiple attempts to be
 * supportable, and the cheap version — one mutable row — is the one that makes
 * a disputed grade unanswerable, because the text the teacher marked no longer
 * exists.
 */
const assignmentSubmissionSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /** Typed answer or pasted code, depending on the assignment's type. */
    content: { type: String, default: null, maxlength: TEACHING_LIMITS.submissionTextMax },
    /** For a `code` submission, so the viewer can highlight it. */
    language: { type: String, default: null, maxlength: 40 },
    links: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] },

    submittedAt: { type: Date, default: Date.now, index: true },
    /**
     * Decided at submission time against the assignment's own deadline, then
     * frozen. Recomputing it on read would silently relabel every past
     * submission the moment a teacher extended a deadline.
     */
    isLate: { type: Boolean, default: false },
    attemptNumber: { type: Number, default: 1, min: 1 },

    status: {
      type: String,
      enum: ["submitted", "graded", "returned", "superseded"],
      default: "submitted",
      index: true,
    },

    marks: { type: Number, default: null, min: 0 },
    feedback: { type: String, default: null, maxlength: TEACHING_LIMITS.feedbackMax },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1, attemptNumber: -1 });
assignmentSubmissionSchema.index({ studentId: 1, createdAt: -1 });

export type AssignmentSubmissionDoc = InferSchemaType<typeof assignmentSubmissionSchema>;

resetModelInDev("AssignmentSubmission");

export const AssignmentSubmission: Model<AssignmentSubmissionDoc> =
  (mongoose.models.AssignmentSubmission as Model<AssignmentSubmissionDoc>) ||
  mongoose.model<AssignmentSubmissionDoc>(
    "AssignmentSubmission",
    assignmentSubmissionSchema
  );

export { targetSnapshotSchema, academicTarget };
