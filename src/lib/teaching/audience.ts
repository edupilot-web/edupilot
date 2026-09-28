import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { resolveAcademicPosition } from "@/lib/curriculum/position";
import { CurriculumSubject, Regulation } from "@/models/Curriculum";
import { Program } from "@/models/AcademicStructure";
import { StudentProfile } from "@/models/StudentProfile";
import { User } from "@/models/User";

/**
 * AcademicAudienceResolver (§18, §19, §102).
 *
 * The single most important service in this module, and the reason a teacher
 * never picks students by hand. Given an academic coordinate it answers: which
 * students are, *right now*, in that place in the curriculum.
 *
 * **§19 is the hard part, and it is already solved.** "Notify all students who
 * are in that year currently" cannot be answered from a stored year number:
 * `StudentProfile.currentYear` is a value a student typed during onboarding and
 * is wrong from the next July onwards. The curriculum module's
 * `resolveAcademicPosition()` derives the position from the *admission year*,
 * which stays right as terms roll over — so a student who has moved from Year 2
 * to Year 3 stops matching a Year 2 query without anybody updating a row.
 *
 * That derivation is per-student arithmetic, not a database predicate, which
 * shapes this whole file: the coordinate narrows the query as far as Mongo can
 * (college, programme, branch, regulation — all indexed), and the semester is
 * then settled in memory over the candidates. A cohort is a few hundred rows,
 * so this is cheap; what it is not is expressible as a `find`, and pretending
 * otherwise by filtering on `currentSemester` would quietly target last year's
 * students.
 */

export type AudienceCoordinate = {
  collegeId: Types.ObjectId | string;
  programId: Types.ObjectId | string;
  branchId: Types.ObjectId | string;
  regulationId: Types.ObjectId | string;
  /** The semester within the whole programme — 3 is the first of second year. */
  semester: number;
  /**
   * Restrict to one cohort. Null means "whoever is in that semester now",
   * which is the normal case and what §19 describes.
   */
  admissionYear?: number | null;
};

export type AudienceMember = {
  userId: Types.ObjectId;
  studentProfileId: Types.ObjectId;
  name: string;
  email: string;
  admissionYear: number | null;
  /** The position this student was matched on, for explaining the result. */
  year: number;
  semester: number;
};

export type AudienceResult = {
  members: AudienceMember[];
  count: number;
  /**
   * Students who match the coordinate but were excluded, and why.
   *
   * Returned rather than silently dropped because the difference between "your
   * assignment reached 184 students" and "it reached 184, and 6 more were
   * skipped because their account is unverified" is the difference between a
   * teacher trusting the number and a student asking why they never got it.
   */
  skipped: {
    graduated: number;
    unverified: number;
    incompleteProfile: number;
    positionUnknown: number;
    differentSemester: number;
  };
};

/**
 * Resolve the students at one point in a curriculum.
 *
 * Deliberately returns *no* students rather than a wider set when the
 * coordinate is incomplete. An audience query that silently broadened would
 * publish to the wrong cohort, and the failure would look like success.
 */
export async function resolveAudience(
  coordinate: AudienceCoordinate
): Promise<AudienceResult> {
  await connectDB();

  const empty: AudienceResult = {
    members: [],
    count: 0,
    skipped: {
      graduated: 0,
      unverified: 0,
      incompleteProfile: 0,
      positionUnknown: 0,
      differentSemester: 0,
    },
  };

  for (const key of ["collegeId", "programId", "branchId", "regulationId"] as const) {
    if (!Types.ObjectId.isValid(String(coordinate[key]))) return empty;
  }
  if (!Number.isInteger(coordinate.semester) || coordinate.semester < 1) return empty;

  /**
   * The database half: everything that *is* a stored fact.
   *
   * `currentSemester` is deliberately absent from this filter even though the
   * field exists — see the note at the top of the file. Including it would be
   * faster and wrong.
   */
  const candidates = await StudentProfile.find({
    collegeId: coordinate.collegeId,
    programId: coordinate.programId,
    branchId: coordinate.branchId,
    regulationId: coordinate.regulationId,
    ...(coordinate.admissionYear ? { admissionYear: coordinate.admissionYear } : {}),
  })
    .select(
      "userId collegeId studyStatus admissionYear admissionType currentYear currentSemester profileCompleted"
    )
    .lean();

  if (!candidates.length) return empty;

  // The regulation and programme bound the derived position, so a student two
  // years past a four-year course is reported as graduated rather than as being
  // in semester 11.
  const [regulation, program] = await Promise.all([
    Regulation.findById(coordinate.regulationId).select("totalSemesters").lean(),
    Program.findById(coordinate.programId).select("durationYears").lean(),
  ]);

  const skipped = { ...empty.skipped };
  const matchedProfiles: typeof candidates = [];

  for (const profile of candidates) {
    if (!profile.profileCompleted) {
      skipped.incompleteProfile += 1;
      continue;
    }

    const position = resolveAcademicPosition({
      studyStatus: profile.studyStatus,
      admissionYear: profile.admissionYear,
      admissionType: profile.admissionType,
      currentYear: profile.currentYear,
      currentSemester: profile.currentSemester,
      totalSemesters: regulation?.totalSemesters ?? null,
      durationYears: program?.durationYears ?? null,
    });

    if (position.source === "graduated") {
      skipped.graduated += 1;
      continue;
    }
    if (position.semester === null) {
      // We know the college and the branch but not which half of the year they
      // are in — usually a profile with no admission year. Targeting them
      // would be a guess, and a guess that puts work in front of the wrong
      // cohort.
      skipped.positionUnknown += 1;
      continue;
    }
    if (position.semester !== coordinate.semester) {
      skipped.differentSemester += 1;
      continue;
    }

    matchedProfiles.push({ ...profile, currentSemester: position.semester });
  }

  if (!matchedProfiles.length) {
    return { ...empty, skipped };
  }

  /**
   * The account check, in one query.
   *
   * §18 asks for students who are active and not suspended. `User` has no
   * suspension flag today, so the live conditions are existence and a verified
   * address — an unverified account is one nobody has proved belongs to a real
   * student, and it is also one that cannot sign in to read the notification.
   * The moment a suspension flag exists it belongs in this filter and nowhere
   * else.
   */
  const users = await User.find({
    _id: { $in: matchedProfiles.map((profile) => profile.userId) },
    role: "student",
    emailVerified: true,
  })
    .select("name email")
    .lean();

  const userById = new Map(users.map((user) => [String(user._id), user]));

  const members: AudienceMember[] = [];

  for (const profile of matchedProfiles) {
    const user = userById.get(String(profile.userId));
    if (!user) {
      skipped.unverified += 1;
      continue;
    }

    members.push({
      userId: profile.userId,
      studentProfileId: profile._id,
      name: user.name,
      email: user.email,
      admissionYear: profile.admissionYear ?? null,
      year: Math.ceil(coordinate.semester / 2),
      semester: coordinate.semester,
    });
  }

  return { members, count: members.length, skipped };
}

/**
 * Just the count, for the "Eligible students: 184" preview (§15).
 *
 * Runs the full resolution rather than a cheaper approximation, because a
 * preview that disagreed with the publish would be worse than no preview: the
 * teacher's confidence in the number is the entire point of showing it.
 */
export async function countAudience(coordinate: AudienceCoordinate): Promise<AudienceResult> {
  return resolveAudience(coordinate);
}

/**
 * The coordinate a subject implies.
 *
 * A `CurriculumSubject` row already *is* one subject of one branch under one
 * regulation at one college, so the audience for a subject is a property of the
 * subject — not something a caller assembles and could assemble wrongly. Every
 * publish path goes through here, which is why no request body in this module
 * carries a `programId` or a `branchId` at all.
 */
export async function coordinateForSubject(
  subjectId: Types.ObjectId | string,
  admissionYear?: number | null
): Promise<(AudienceCoordinate & { subjectName: string; subjectCode: string }) | null> {
  if (!Types.ObjectId.isValid(String(subjectId))) return null;

  await connectDB();

  const subject = await CurriculumSubject.findById(subjectId)
    .select("collegeId programId branchId regulationId semester name code status")
    .lean();

  if (!subject || subject.status !== "active") return null;

  return {
    collegeId: subject.collegeId,
    programId: subject.programId,
    branchId: subject.branchId,
    regulationId: subject.regulationId,
    semester: subject.semester,
    admissionYear: admissionYear ?? null,
    subjectName: subject.name,
    subjectCode: subject.code,
  };
}

/**
 * Whether one student is in the audience for a subject, right now.
 *
 * Used by the student-side reads to answer "may I open this note", which is a
 * different question from "was I sent it". The materialised `NoteRecipient` and
 * `AssignmentStudent` rows answer the second and are the authority for anything
 * already published — this is for the live check on content a student is
 * reaching by id.
 */
export async function studentMatchesSubject(
  userId: string,
  subjectId: Types.ObjectId | string
): Promise<boolean> {
  const coordinate = await coordinateForSubject(subjectId);
  if (!coordinate) return false;

  const profile = await StudentProfile.findOne({ userId })
    .select("collegeId programId branchId regulationId")
    .lean();

  if (!profile) return false;

  return (
    String(profile.collegeId) === String(coordinate.collegeId) &&
    String(profile.programId) === String(coordinate.programId) &&
    String(profile.branchId) === String(coordinate.branchId) &&
    String(profile.regulationId) === String(coordinate.regulationId)
  );
}
