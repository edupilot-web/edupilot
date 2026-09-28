import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { CurriculumSubject } from "@/models/Curriculum";
import { TeacherAcademicAssignment, TeacherProfile } from "@/models/Teacher";
import { User } from "@/models/User";
import { notify } from "@/lib/notifications/service";
import { canTransitionTeacher, type TeacherStatus } from "@/lib/teaching/fields";
import type { CurrentAdmin } from "@/lib/admin/current-admin";

/**
 * Admin-side teacher management (§56, §57).
 *
 * Two jobs: approving accounts, and deciding which subjects each teacher may
 * publish to. The second is the one that matters — approval makes an account
 * usable, but a teacher with no subject assignment can still do nothing at all.
 *
 * **Every query is scoped by the administrator's own college**, when they have
 * one. `collegeScope()` is the single place that decides, so a route cannot
 * forget: a college admin sees their institution, a platform admin sees
 * everything, and neither can express the other's view by passing a parameter.
 */

/**
 * The college filter for this administrator.
 *
 * Null `collegeId` means platform-wide, which is what every administrator who
 * predates this module has. A scoped admin asking for another college gets an
 * empty filter result rather than an error — but the *request* never carries a
 * college at all, so there is nothing to disagree with.
 */
function collegeScope(admin: CurrentAdmin): Record<string, unknown> {
  return admin.collegeId ? { collegeId: admin.collegeId } : {};
}

/** Whether this administrator may act on something belonging to `collegeId`. */
export function adminCanReachCollege(admin: CurrentAdmin, collegeId: string): boolean {
  return !admin.collegeId || admin.collegeId === collegeId;
}

// ── Listing ───────────────────────────────────────────────────────────────

export type TeacherRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  collegeId: string;
  collegeName: string;
  departmentName: string | null;
  designation: string | null;
  employeeId: string | null;
  status: TeacherStatus;
  subjectCount: number;
  createdAt: string;
};

export async function listTeachers(
  admin: CurrentAdmin,
  options: { status?: string | null; search?: string | null; limit?: number; skip?: number } = {}
): Promise<{ rows: TeacherRow[]; total: number; pending: number }> {
  await connectDB();

  const filter: Record<string, unknown> = { ...collegeScope(admin) };
  if (options.status && options.status !== "all") filter.status = options.status;

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);

  const [profiles, total, pending] = await Promise.all([
    TeacherProfile.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    TeacherProfile.countDocuments(filter),
    TeacherProfile.countDocuments({ ...collegeScope(admin), status: "pending" }),
  ]);

  if (!profiles.length) return { rows: [], total, pending };

  const users = await User.find({ _id: { $in: profiles.map((row) => row.userId) } })
    .select("name email emailVerified")
    .lean();

  const userById = new Map(users.map((user) => [String(user._id), user]));

  let rows: TeacherRow[] = profiles.map((profile) => {
    const user = userById.get(String(profile.userId));
    return {
      id: String(profile._id),
      userId: String(profile.userId),
      name: user?.name ?? "(account removed)",
      email: user?.email ?? "",
      emailVerified: user?.emailVerified === true,
      collegeId: String(profile.collegeId),
      collegeName: profile.collegeName,
      departmentName: profile.departmentName ?? null,
      designation: profile.designation ?? null,
      employeeId: profile.employeeId ?? null,
      status: profile.status as TeacherStatus,
      subjectCount: profile.subjectCount ?? 0,
      createdAt: profile.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  });

  if (options.search?.trim()) {
    // Filters the page rather than the query: the name lives on `User` and the
    // page on `TeacherProfile`, so a server-side search across both would be an
    // aggregation with a `$lookup` on every keystroke.
    const needle = options.search.trim().toLowerCase();
    rows = rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        (row.employeeId ?? "").toLowerCase().includes(needle)
    );
  }

  return { rows, total, pending };
}

export async function getTeacher(admin: CurrentAdmin, teacherProfileId: string) {
  if (!Types.ObjectId.isValid(teacherProfileId)) return null;

  await connectDB();

  const profile = await TeacherProfile.findOne({
    _id: teacherProfileId,
    ...collegeScope(admin),
  }).lean();

  if (!profile) return null;

  const [user, assignments] = await Promise.all([
    User.findById(profile.userId).select("name email emailVerified createdAt").lean(),
    TeacherAcademicAssignment.find({ teacherId: profile._id })
      .sort({ status: 1, year: 1, semester: 1 })
      .lean(),
  ]);

  return {
    id: String(profile._id),
    userId: String(profile.userId),
    name: user?.name ?? "(account removed)",
    email: user?.email ?? "",
    emailVerified: user?.emailVerified === true,
    collegeId: String(profile.collegeId),
    collegeName: profile.collegeName,
    departmentName: profile.departmentName ?? null,
    designation: profile.designation ?? null,
    employeeId: profile.employeeId ?? null,
    phone: profile.phone ?? null,
    status: profile.status as TeacherStatus,
    rejectionReason: profile.rejectionReason ?? null,
    suspensionReason: profile.suspensionReason ?? null,
    createdAt: profile.createdAt?.toISOString() ?? null,
    approvedAt: profile.approvedAt?.toISOString() ?? null,
    subjects: assignments.map((assignment) => ({
      id: String(assignment._id),
      subjectId: String(assignment.subjectId),
      subjectName: assignment.subjectName ?? "",
      subjectCode: assignment.subjectCode ?? "",
      programName: assignment.programName ?? null,
      branchName: assignment.branchName ?? null,
      regulationCode: assignment.regulationCode ?? null,
      year: assignment.year,
      semester: assignment.semester,
      admissionYear: assignment.admissionYear ?? null,
      status: assignment.status,
      assignedAt: assignment.assignedAt?.toISOString() ?? null,
    })),
  };
}

// ── Approval (§4, §56) ────────────────────────────────────────────────────

export async function setTeacherStatus(
  admin: CurrentAdmin,
  teacherProfileId: string,
  to: TeacherStatus,
  reason: string | null
): Promise<{ status: TeacherStatus }> {
  await connectDB();

  if (!Types.ObjectId.isValid(teacherProfileId)) {
    throw new HttpError(404, "That teacher could not be found.");
  }

  const profile = await TeacherProfile.findOne({
    _id: teacherProfileId,
    ...collegeScope(admin),
  }).lean();

  if (!profile) throw new HttpError(404, "That teacher could not be found.");

  const from = profile.status as TeacherStatus;
  if (from === to) return { status: to };

  if (!canTransitionTeacher(from, to)) {
    throw new HttpError(409, `A ${from} teacher account cannot become ${to}.`);
  }

  /**
   * A rejection or a suspension needs a reason.
   *
   * It is the only thing the teacher will be told, and the only thing the next
   * administrator looking at the row can use to understand the decision.
   */
  if ((to === "rejected" || to === "suspended") && !reason?.trim()) {
    throw new HttpError(422, "Give a reason, so the teacher knows what to do next.");
  }

  const now = new Date();
  const update: Record<string, unknown> = { status: to };

  if (to === "active") {
    update.approvedBy = admin.id;
    update.approvedAt = now;
    update.rejectionReason = null;
    update.suspensionReason = null;
    update.suspendedAt = null;
  }
  if (to === "rejected") {
    update.rejectedBy = admin.id;
    update.rejectedAt = now;
    update.rejectionReason = reason?.trim() ?? null;
  }
  if (to === "suspended") {
    update.suspendedAt = now;
    update.suspensionReason = reason?.trim() ?? null;
  }

  await TeacherProfile.updateOne({ _id: profile._id }, { $set: update });

  /**
   * The teacher is told (§35's `TEACHER_APPROVED` / `TEACHER_REJECTED`).
   *
   * These are in the `account` category, which nobody can switch off — a
   * rejection the recipient has muted is a decision they never learn about.
   */
  if (to === "active" || to === "rejected") {
    await notify({
      recipientIds: [String(profile.userId)],
      type: to === "active" ? "TEACHER_APPROVED" : "TEACHER_REJECTED",
      entityType: "teacher",
      entityId: profile._id,
      data: { reason: reason ?? null },
    });
  }

  return { status: to };
}

// ── Subject assignment (§11, §57) ─────────────────────────────────────────

export async function assignSubject(
  admin: CurrentAdmin,
  teacherProfileId: string,
  input: { subjectId: string; admissionYear?: number | null }
): Promise<{ id: string; subjectName: string }> {
  await connectDB();

  if (!Types.ObjectId.isValid(teacherProfileId) || !Types.ObjectId.isValid(input.subjectId)) {
    throw new HttpError(404, "That teacher or subject could not be found.");
  }

  const profile = await TeacherProfile.findOne({
    _id: teacherProfileId,
    ...collegeScope(admin),
  }).lean();

  if (!profile) throw new HttpError(404, "That teacher could not be found.");

  /**
   * The subject must be in the **teacher's** college (§10, §77).
   *
   * Not the administrator's — a platform admin has none, and the teacher's is
   * the scope that actually constrains what they will be able to publish to.
   */
  const subject = await CurriculumSubject.findOne({
    _id: input.subjectId,
    collegeId: profile.collegeId,
    status: "active",
  }).lean();

  if (!subject) {
    throw new HttpError(422, "That subject is not part of this teacher's college curriculum.");
  }

  const existing = await TeacherAcademicAssignment.findOne({
    teacherId: profile._id,
    subjectId: subject._id,
    admissionYear: input.admissionYear ?? null,
  }).lean();

  if (existing) {
    if (existing.status === "active") {
      throw new HttpError(409, "This teacher already has that subject.");
    }

    // A revoked assignment is reinstated rather than duplicated — the unique
    // index would refuse the second row anyway, and reinstating keeps the
    // original `assignedAt` as the record of when they first taught it.
    await TeacherAcademicAssignment.updateOne(
      { _id: existing._id },
      { $set: { status: "active", revokedAt: null, revokedBy: null, assignedBy: admin.id } }
    );
    await TeacherProfile.updateOne({ _id: profile._id }, { $inc: { subjectCount: 1 } });

    return { id: String(existing._id), subjectName: subject.name };
  }

  const created = await TeacherAcademicAssignment.create({
    teacherId: profile._id,
    userId: profile.userId,
    collegeId: profile.collegeId,
    subjectId: subject._id,

    // Denormalised from the subject, never from the request, so the copies
    // cannot disagree with the row they came from.
    programId: subject.programId,
    branchId: subject.branchId,
    regulationId: subject.regulationId,
    year: subject.year,
    semester: subject.semester,
    subjectName: subject.name,
    subjectCode: subject.code,
    programName: subject.programName ?? null,
    branchName: subject.branchName ?? null,
    regulationCode: subject.regulationCode ?? null,

    admissionYear: input.admissionYear ?? null,
    status: "active",
    assignedBy: admin.id,
    assignedAt: new Date(),
  });

  await TeacherProfile.updateOne({ _id: profile._id }, { $inc: { subjectCount: 1 } });

  return { id: String(created._id), subjectName: subject.name };
}

export async function revokeSubject(
  admin: CurrentAdmin,
  teacherProfileId: string,
  assignmentId: string
): Promise<void> {
  await connectDB();

  if (!Types.ObjectId.isValid(teacherProfileId) || !Types.ObjectId.isValid(assignmentId)) {
    throw new HttpError(404, "That assignment could not be found.");
  }

  const profile = await TeacherProfile.findOne({
    _id: teacherProfileId,
    ...collegeScope(admin),
  })
    .select("_id")
    .lean();

  if (!profile) throw new HttpError(404, "That teacher could not be found.");

  /**
   * Revoked, never deleted (§78).
   *
   * The assignments and notes they published stay published — students are
   * working against them — and the record of who was authorised at the time is
   * what makes that defensible. A delete would leave published content with no
   * explanation of how it came to exist.
   */
  const result = await TeacherAcademicAssignment.updateOne(
    { _id: assignmentId, teacherId: profile._id, status: "active" },
    { $set: { status: "revoked", revokedAt: new Date(), revokedBy: admin.id } }
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "That assignment could not be found.");
  }

  await TeacherProfile.updateOne({ _id: profile._id }, { $inc: { subjectCount: -1 } });
}

/**
 * Subjects a teacher could be given.
 *
 * Their college's curriculum, minus what they already hold. Capped, because a
 * large college's curriculum runs to hundreds of rows and the picker is a
 * search box rather than a list to scroll.
 */
export async function assignableSubjects(
  admin: CurrentAdmin,
  teacherProfileId: string,
  search?: string | null
) {
  await connectDB();

  if (!Types.ObjectId.isValid(teacherProfileId)) return [];

  const profile = await TeacherProfile.findOne({
    _id: teacherProfileId,
    ...collegeScope(admin),
  })
    .select("collegeId")
    .lean();

  if (!profile) return [];

  const held = await TeacherAcademicAssignment.find({
    teacherId: profile._id,
    status: "active",
  })
    .select("subjectId")
    .lean();

  const filter: Record<string, unknown> = {
    collegeId: profile.collegeId,
    status: "active",
    _id: { $nin: held.map((row) => row.subjectId) },
  };

  if (search?.trim()) {
    const pattern = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: pattern }, { code: pattern }];
  }

  const subjects = await CurriculumSubject.find(filter)
    .select("name code year semester programName branchName regulationCode")
    .sort({ year: 1, semester: 1, name: 1 })
    .limit(50)
    .lean();

  return subjects.map((subject) => ({
    subjectId: String(subject._id),
    name: subject.name,
    code: subject.code,
    year: subject.year,
    semester: subject.semester,
    programName: subject.programName ?? null,
    branchName: subject.branchName ?? null,
    regulationCode: subject.regulationCode ?? null,
  }));
}
