import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  TEACHER_ASSIGNMENT_STATUSES,
  TEACHER_STATUSES,
} from "@/lib/teaching/fields";

/**
 * The teacher: who they are, which college they belong to, and what they are
 * allowed to teach.
 *
 * **A teacher is a `User` with `role: "teacher"`**, exactly as a student is a
 * `User` with `role: "student"`. There is no second account table, no second
 * password hash and no second session cookie — §99 forbids duplicating
 * authentication, and the reason is sharper than tidiness: two auth systems
 * means two places to get password hashing, email verification, rate limiting
 * and session expiry right, and the second one is always the one that is wrong.
 *
 *   User (role: "teacher")
 *     └── TeacherProfile              college, department, approval state
 *           └── TeacherAcademicAssignment[]   the subjects they may act on
 *
 * The split mirrors `StudentProfile`: the account is written by signing up, the
 * profile by the college, and they grow different fields.
 */

// ── Teacher profile ───────────────────────────────────────────────────────

const teacherProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    /**
     * The college this teacher belongs to. **The authority for every
     * college-scoped query in the module** (§10).
     *
     * Required and never null, unlike `StudentProfile.collegeId`. A student may
     * type a college the directory does not hold yet and still use the product;
     * a teacher with no college has nobody to teach and no scope to be confined
     * to, so the signup form refuses to submit without one.
     */
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    /** Denormalised so a teacher header renders without a join. */
    collegeName: { type: String, required: true, maxlength: 200 },

    /** Optional, from the college's own department list. */
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null, index: true },
    departmentName: { type: String, default: null, maxlength: 160 },

    employeeId: { type: String, default: null, trim: true, maxlength: 40 },
    designation: { type: String, default: null, trim: true, maxlength: 80 },
    phone: { type: String, default: null, trim: true, maxlength: 24 },

    status: { type: String, enum: TEACHER_STATUSES, default: "pending", index: true },

    /**
     * Who decided, and why.
     *
     * `rejectionReason` is required by the code that rejects, not by the
     * schema: a rejection with no stated reason is one the teacher cannot act
     * on and the next administrator cannot explain.
     */
    approvedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 1000 },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: null, maxlength: 1000 },

    /** Denormalised counters, so the college's teacher list needs no per-row query. */
    assignmentCount: { type: Number, default: 0, min: 0 },
    noteCount: { type: Number, default: 0, min: 0 },
    subjectCount: { type: Number, default: 0, min: 0 },

    lastActiveAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** The college admin's queue: "who is waiting for me", newest first. */
teacherProfileSchema.index({ collegeId: 1, status: 1, createdAt: -1 });
teacherProfileSchema.index({ collegeId: 1, departmentId: 1 });

export type TeacherProfileDoc = InferSchemaType<typeof teacherProfileSchema>;

resetModelInDev("TeacherProfile");

export const TeacherProfile: Model<TeacherProfileDoc> =
  (mongoose.models.TeacherProfile as Model<TeacherProfileDoc>) ||
  mongoose.model<TeacherProfileDoc>("TeacherProfile", teacherProfileSchema);

// ── Academic assignment (§11) ─────────────────────────────────────────────

/**
 * One subject a teacher is authorised to act on, at one point in the
 * curriculum.
 *
 * This is the whole of §11 and the thing that makes §94's second security test
 * pass: a teacher assigned Data Structures cannot create an assignment for
 * DBMS, even though both are in their college and both are in their branch.
 * Being a teacher at a college grants nothing by itself.
 *
 * **The subject is the key.** `subjectId` points at a `CurriculumSubject`,
 * which is already one subject of one branch under one regulation at one
 * college — so college, programme, branch, regulation, year and semester are
 * all *implied* by it. They are stored anyway, denormalised, because the
 * college admin's list ("who teaches second-year CSE?") filters on them and
 * resolving six joins per row to answer that would make the screen unusable.
 *
 * The denormalised copies are written from the subject and never from a
 * request, so they cannot disagree with it.
 */
const teacherAcademicAssignmentSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "TeacherProfile", required: true, index: true },
    /** The `User` row, so a session can be authorised without a profile lookup. */
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },

    /**
     * The curriculum row. Everything below it is derived from this.
     */
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "CurriculumSubject",
      required: true,
      index: true,
    },

    // ── Denormalised from the subject, for filtering and display ──────────
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", required: true },
    year: { type: Number, required: true, min: 1, max: 8 },
    semester: { type: Number, required: true, min: 1, max: 16 },

    subjectName: { type: String, default: null, maxlength: 300 },
    subjectCode: { type: String, default: null, maxlength: 24 },
    programName: { type: String, default: null, maxlength: 200 },
    branchName: { type: String, default: null, maxlength: 160 },
    regulationCode: { type: String, default: null, maxlength: 20 },

    /**
     * Which cohort, when a college wants to be specific.
     *
     * Null means "whichever students are currently in that semester", which is
     * the normal case and the one §19 describes. A value pins the assignment to
     * one admission year, for a college running two cohorts through the same
     * semester with different staff.
     */
    admissionYear: { type: Number, default: null, min: 1980, max: 2100 },

    status: {
      type: String,
      enum: TEACHER_ASSIGNMENT_STATUSES,
      default: "active",
      index: true,
    },

    assignedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    assignedAt: { type: Date, default: Date.now },
    /**
     * Revoked rather than deleted (§78: "teacher removed from subject after
     * creating assignment").
     *
     * The assignments and notes they published stay published — students are
     * working against them — and the record of who was authorised at the time
     * is what makes that defensible. A delete would leave published content
     * with no explanation of how it came to exist.
     */
    revokedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * One row per teacher, subject and cohort (§76).
 *
 * `admissionYear` is in the key because a college may legitimately assign the
 * same subject for two cohorts to two teachers. Null is a distinct value here
 * and there can only be one "all cohorts" row per subject, which is correct:
 * a second one would be a duplicate, not a broader grant.
 */
teacherAcademicAssignmentSchema.index(
  { teacherId: 1, subjectId: 1, admissionYear: 1 },
  { unique: true }
);
/** The authorisation lookup, on the hot path of every teacher write. */
teacherAcademicAssignmentSchema.index({ userId: 1, status: 1, subjectId: 1 });
/** The college admin's view: who teaches what, filtered by cohort. */
teacherAcademicAssignmentSchema.index({ collegeId: 1, year: 1, semester: 1, status: 1 });
/** "Who else teaches this subject" — used when a teacher is deactivated. */
teacherAcademicAssignmentSchema.index({ subjectId: 1, status: 1 });

export type TeacherAcademicAssignmentDoc = InferSchemaType<
  typeof teacherAcademicAssignmentSchema
>;

resetModelInDev("TeacherAcademicAssignment");

export const TeacherAcademicAssignment: Model<TeacherAcademicAssignmentDoc> =
  (mongoose.models.TeacherAcademicAssignment as Model<TeacherAcademicAssignmentDoc>) ||
  mongoose.model<TeacherAcademicAssignmentDoc>(
    "TeacherAcademicAssignment",
    teacherAcademicAssignmentSchema
  );
