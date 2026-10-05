import { cache } from "react";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { sessionIsFresh } from "@/lib/password-reset";
import { connectDB } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { CurriculumSubject } from "@/models/Curriculum";
import { TeacherAcademicAssignment, TeacherProfile } from "@/models/Teacher";
import { User } from "@/models/User";
import {
  canTeacherPublish,
  requiresActiveTeacher,
  type TeacherCapability,
  type TeacherStatus,
} from "@/lib/teaching/fields";

/**
 * Who the teacher is, and what they are allowed to touch (§10, §55, §66).
 *
 * Two gates, and they are different questions:
 *
 *   `requireTeacher()`  — is this a teacher, and may they act at all?
 *   `requireSubject()`  — may they act on *this* subject?
 *
 * The first is about the account; the second is about
 * `TeacherAcademicAssignment`, and it is the one that makes §94's second
 * security test pass. Being a teacher at a college grants nothing on its own.
 *
 * **The college is never a parameter.** §10 is explicit, and the enforcement
 * here is structural rather than a check: `TeacherContext.collegeId` comes from
 * the profile, and every query in the module takes it from the context object
 * rather than from a request. There is no code path that accepts a college id
 * from a caller, so there is nothing to validate a caller's college *against*.
 */

export type TeacherContext = {
  userId: string;
  teacherProfileId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  collegeId: string;
  collegeName: string;
  departmentId: string | null;
  departmentName: string | null;
  designation: string | null;
  employeeId: string | null;
  status: TeacherStatus;
  /** Approved *and* verified — the gate on everything students can see. */
  canPublish: boolean;
};

/**
 * The signed-in teacher, or null.
 *
 * Wrapped in React's `cache` so a layout and the page inside it share one
 * query per request, exactly as `getCurrentUser` does for students.
 */
export const getCurrentTeacher = cache(async (): Promise<TeacherContext | null> => {
  const session = await getSession();
  if (!session) return null;

  /**
   * The role on the *token* is not enough.
   *
   * A session is signed for up to thirty days; a teacher whose account was
   * deactivated this morning still holds a token that says `role: "teacher"`.
   * The database is asked on every request, which is also how a suspension
   * takes effect immediately rather than whenever the cookie happens to expire.
   */
  if (session.role !== "teacher") return null;

  await connectDB();

  const user = await User.findById(session.sub)
    .select("name email role emailVerified sessionsValidFrom")
    .lean();
  if (!user || user.role !== "teacher") return null;

  // Free here: the document is already loaded. A password reset revokes every
  // session, and a teacher's is no exception.
  if (!sessionIsFresh(session.issuedAt, user.sessionsValidFrom)) return null;

  const profile = await TeacherProfile.findOne({ userId: session.sub }).lean();
  if (!profile) return null;

  return {
    userId: String(user._id),
    teacherProfileId: String(profile._id),
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified === true,
    collegeId: String(profile.collegeId),
    collegeName: profile.collegeName,
    departmentId: profile.departmentId ? String(profile.departmentId) : null,
    departmentName: profile.departmentName ?? null,
    designation: profile.designation ?? null,
    employeeId: profile.employeeId ?? null,
    status: profile.status as TeacherStatus,
    canPublish: canTeacherPublish({
      status: profile.status,
      emailVerified: user.emailVerified,
    }),
  };
});

/**
 * The teacher, or a thrown `HttpError` the route's `handleError` turns into a
 * response.
 *
 * 401 for "not a teacher" and 403 for "a teacher who may not do this", because
 * they need different fixes: one means sign in, the other means ask your
 * college. A single status would leave both guessing.
 */
export async function requireTeacher(capability?: TeacherCapability): Promise<TeacherContext> {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new HttpError(401, "Sign in as a teacher to do that");

  if (capability && requiresActiveTeacher(capability)) {
    if (teacher.status === "pending") {
      throw new HttpError(
        403,
        "Your account is waiting for approval from your college. You can prepare drafts, but not publish."
      );
    }
    if (teacher.status !== "active") {
      throw new HttpError(403, "Your teacher account is not active.");
    }
    if (!teacher.emailVerified) {
      throw new HttpError(403, "Confirm your email address before publishing to students.");
    }
  }

  return teacher;
}

// ── Subject authorisation (§11, §12, §94) ─────────────────────────────────

export type AuthorizedSubject = {
  subjectId: string;
  name: string;
  code: string;
  collegeId: string;
  programId: string;
  branchId: string;
  regulationId: string;
  year: number;
  semester: number;
  programName: string | null;
  branchName: string | null;
  regulationCode: string | null;
  /** The cohort this teacher is assigned to, or null for all of them. */
  admissionYear: number | null;
  teacherAssignmentId: string;
};

/**
 * May this teacher act on this subject?
 *
 * Two conditions, checked in one place so no caller can satisfy one and forget
 * the other:
 *
 *   1. an **active** `TeacherAcademicAssignment` for the subject, and
 *   2. the subject's own college matching the teacher's.
 *
 * The second looks redundant — the assignment row carries a college, so a
 * subject from another college could not have been assigned. It is checked
 * anyway because the two could disagree if a subject were ever re-pointed at a
 * different college, and the cost of the check is a field comparison on a
 * document already in hand. §94's first test is that a teacher at College A
 * cannot create for College B; this is where it fails.
 *
 * Returns null rather than throwing, so callers can turn it into a 403 or a
 * filtered-out list entry as their context requires.
 */
export async function authorizeSubject(
  teacher: TeacherContext,
  subjectId: string
): Promise<AuthorizedSubject | null> {
  if (!Types.ObjectId.isValid(subjectId)) return null;

  await connectDB();

  const assignment = await TeacherAcademicAssignment.findOne({
    userId: teacher.userId,
    subjectId,
    status: "active",
  }).lean();

  if (!assignment) return null;
  if (String(assignment.collegeId) !== teacher.collegeId) return null;

  const subject = await CurriculumSubject.findOne({
    _id: subjectId,
    // The teacher's own college, from the context — never from a request.
    collegeId: teacher.collegeId,
    status: "active",
  })
    .select("name code collegeId programId branchId regulationId year semester programName branchName regulationCode")
    .lean();

  if (!subject) return null;

  return {
    subjectId: String(subject._id),
    name: subject.name,
    code: subject.code,
    collegeId: String(subject.collegeId),
    programId: String(subject.programId),
    branchId: String(subject.branchId),
    regulationId: String(subject.regulationId),
    year: subject.year,
    semester: subject.semester,
    programName: subject.programName ?? null,
    branchName: subject.branchName ?? null,
    regulationCode: subject.regulationCode ?? null,
    admissionYear: assignment.admissionYear ?? null,
    teacherAssignmentId: String(assignment._id),
  };
}

/** The same check, as a throw. */
export async function requireSubject(
  teacher: TeacherContext,
  subjectId: string
): Promise<AuthorizedSubject> {
  const subject = await authorizeSubject(teacher, subjectId);
  if (!subject) {
    /**
     * 403 with a message about *permission*, not 404.
     *
     * A teacher is a colleague inside the same institution, not an anonymous
     * prober: telling them "you are not assigned to this subject" is the
     * information they need to ask for access, and the subject's existence is
     * not a secret from them. That is the opposite of the student-side rule,
     * where a foreign id must be indistinguishable from a missing one — there,
     * the prober may be from another college entirely.
     */
    throw new HttpError(403, "You are not assigned to this subject.");
  }
  return subject;
}

// ── The teacher's own academic context (§9, §12) ──────────────────────────

export type TeacherSubjectOption = AuthorizedSubject & {
  /** How many assignments and notes they already have here. */
  assignmentCount?: number;
  noteCount?: number;
};

/**
 * Every subject this teacher may act on, ready for the cascade (§12).
 *
 * One query, not the seven-step cascade the *admin* module uses. A teacher has
 * between one and a dozen assignments; fetching them all and letting the client
 * narrow year → programme → branch → semester → subject in memory is one round
 * trip instead of five, and the narrowing is over a list small enough that the
 * browser does it instantly.
 *
 * It also guarantees §12's real requirement — "only subjects that teacher is
 * authorized to teach should appear" — by construction rather than by
 * filtering, because nothing else is ever fetched.
 */
export async function listTeacherSubjects(
  teacher: TeacherContext
): Promise<TeacherSubjectOption[]> {
  await connectDB();

  const assignments = await TeacherAcademicAssignment.find({
    userId: teacher.userId,
    collegeId: teacher.collegeId,
    status: "active",
  })
    .sort({ year: 1, semester: 1, subjectName: 1 })
    .lean();

  return assignments.map((assignment) => ({
    subjectId: String(assignment.subjectId),
    name: assignment.subjectName ?? "Untitled subject",
    code: assignment.subjectCode ?? "",
    collegeId: String(assignment.collegeId),
    programId: String(assignment.programId),
    branchId: String(assignment.branchId),
    regulationId: String(assignment.regulationId),
    year: assignment.year,
    semester: assignment.semester,
    programName: assignment.programName ?? null,
    branchName: assignment.branchName ?? null,
    regulationCode: assignment.regulationCode ?? null,
    admissionYear: assignment.admissionYear ?? null,
    teacherAssignmentId: String(assignment._id),
  }));
}

/**
 * The cascade's options, derived from the list above.
 *
 * Returned as nested groups rather than as five endpoints, for the same reason:
 * the whole tree is a few dozen rows, and five dependent requests to walk it
 * would be five round trips on a screen a teacher opens before every single
 * thing they do.
 */
export type AcademicContextTree = {
  collegeId: string;
  collegeName: string;
  programs: {
    programId: string;
    programName: string;
    branches: {
      branchId: string;
      branchName: string;
      regulations: {
        regulationId: string;
        regulationCode: string;
        semesters: {
          year: number;
          semester: number;
          subjects: { subjectId: string; name: string; code: string }[];
        }[];
      }[];
    }[];
  }[];
};

export async function getAcademicContextTree(
  teacher: TeacherContext
): Promise<AcademicContextTree> {
  const subjects = await listTeacherSubjects(teacher);

  const tree: AcademicContextTree = {
    collegeId: teacher.collegeId,
    collegeName: teacher.collegeName,
    programs: [],
  };

  for (const subject of subjects) {
    const program = upsert(
      tree.programs,
      (entry) => entry.programId === subject.programId,
      () => ({
        programId: subject.programId,
        programName: subject.programName ?? "Programme",
        branches: [],
      })
    );

    const branch = upsert(
      program.branches,
      (entry) => entry.branchId === subject.branchId,
      () => ({
        branchId: subject.branchId,
        branchName: subject.branchName ?? "Branch",
        regulations: [],
      })
    );

    const regulation = upsert(
      branch.regulations,
      (entry) => entry.regulationId === subject.regulationId,
      () => ({
        regulationId: subject.regulationId,
        regulationCode: subject.regulationCode ?? "—",
        semesters: [],
      })
    );

    const semester = upsert(
      regulation.semesters,
      (entry) => entry.semester === subject.semester,
      () => ({ year: subject.year, semester: subject.semester, subjects: [] })
    );

    semester.subjects.push({
      subjectId: subject.subjectId,
      name: subject.name,
      code: subject.code,
    });
  }

  return tree;
}

function upsert<T>(list: T[], match: (entry: T) => boolean, create: () => T): T {
  const existing = list.find(match);
  if (existing) return existing;
  const created = create();
  list.push(created);
  return created;
}
