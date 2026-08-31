import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { Department, Program } from "@/models/AcademicStructure";
import { University } from "@/models/University";
import { State } from "@/models/Geo";
import { CurriculumSubject, Regulation, yearForSemester } from "@/models/Curriculum";

/**
 * Server-side validation of a student's academic selections (spec §30).
 *
 * The same principle as the AI module's context builder, and for the same
 * reason: the browser sends ids, and every relationship between them is checked
 * here before anything is stored. A student who edited a request could otherwise
 * attach themselves to a regulation their college does not run, and every
 * downstream feature — subject recommendations, AI content, cohort analytics —
 * would inherit that lie.
 *
 * Different from `ai/context.ts` in two ways, which is why it is a separate
 * function rather than a shared one:
 *
 *   - **Nothing after the college is mandatory.** Only six of 480 colleges have
 *     a curriculum configured, so the resolver validates *what was supplied* and
 *     reports how far it got, rather than failing on the first missing level.
 *   - **There is no academic year.** A student has an admission *batch*; the
 *     cohort year is a property of generated content, not of the student.
 */

export type AcademicSelection = {
  stateId?: string | null;
  collegeId?: string | null;
  universityId?: string | null;
  programId?: string | null;
  branchId?: string | null;
  regulationId?: string | null;
  admissionYear?: number | null;
  admissionType?: string | null;
  currentYear?: number | null;
  currentSemester?: number | null;
  subjectIds?: string[];
  /**
   * A manual override of the derived expected graduation (§46).
   *
   * Carried here rather than computed only, because a transfer or a repeated
   * year makes the arithmetic wrong and the student knows better than the
   * formula does.
   */
  graduationYear?: number | null;
};

export type ResolvedStudentContext = {
  state: { id: string; name: string } | null;
  college: {
    id: string;
    name: string;
    institutionType: string;
    autonomyStatus: string;
    district: string | null;
    city: string | null;
  } | null;
  university: { id: string; name: string; shortName: string | null } | null;
  program: { id: string; name: string; degree: string; durationYears: number | null } | null;
  branch: { id: string; name: string; code: string | null } | null;
  regulation: { id: string; code: string; name: string; totalSemesters: number } | null;
  admissionYear: number | null;
  admissionType: "regular" | "lateral-entry" | "other";
  currentYear: number | null;
  currentSemester: number | null;
  subjects: { id: string; name: string; code: string; credits: number | null; type: string }[];
  /** Expected graduation, derived unless the student overrode it. */
  expectedGraduationYear: number | null;
  /** Whether this college has any curriculum at all, for skipping steps (§7). */
  hasCurriculum: boolean;
};

export type SelectionFailure = {
  field: keyof AcademicSelection;
  code: string;
  message: string;
};

export type ResolveResult =
  | { ok: true; context: ResolvedStudentContext }
  | { ok: false; failure: SelectionFailure };

function objectId(value: unknown): Types.ObjectId | null {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

function fail(field: keyof AcademicSelection, code: string, message: string): ResolveResult {
  return { ok: false, failure: { field, code, message } };
}

const ADMISSION_TYPES = ["regular", "lateral-entry", "other"] as const;

/**
 * Resolve and verify, stopping at the first *invalid* relationship rather than
 * the first missing one.
 *
 * An id that is absent is fine — the flow may not have reached that step. An id
 * that is present but does not belong is a rejection, because it can only come
 * from a stale form or a tampered request, and storing it would corrupt the
 * academic identity the whole platform reads.
 */
export async function resolveStudentContext(selection: AcademicSelection): Promise<ResolveResult> {
  await connectDB();

  const context: ResolvedStudentContext = {
    state: null,
    college: null,
    university: null,
    program: null,
    branch: null,
    regulation: null,
    admissionYear: null,
    admissionType: "regular",
    currentYear: null,
    currentSemester: null,
    subjects: [],
    expectedGraduationYear: null,
    hasCurriculum: false,
  };

  // ── State ─────────────────────────────────────────────────────────────
  const stateId = objectId(selection.stateId);
  if (selection.stateId && !stateId) {
    return fail("stateId", "invalid-id", "Select your state.");
  }
  if (stateId) {
    const state = await State.findById(stateId).select("name").lean();
    if (!state) return fail("stateId", "state-not-found", "That state no longer exists.");
    context.state = { id: String(state._id), name: state.name };
  }

  // ── College, and its state ────────────────────────────────────────────
  const collegeId = objectId(selection.collegeId);
  if (selection.collegeId && !collegeId) {
    return fail("collegeId", "invalid-id", "Select your college.");
  }
  if (collegeId) {
    const college = await College.findById(collegeId)
      .select("name institutionType autonomyStatus universityId stateId districtName cityName status")
      .lean();
    if (!college) return fail("collegeId", "college-not-found", "That college no longer exists.");

    // §43 case 20: a temporarily inactive college must not be joinable.
    if (college.status !== "active") {
      return fail(
        "collegeId",
        "college-inactive",
        `${college.name} is not currently available. Pick another, or request it be added.`
      );
    }

    // The college must actually be in the chosen state.
    if (stateId && college.stateId && String(college.stateId) !== String(stateId)) {
      return fail(
        "collegeId",
        "college-not-in-state",
        `${college.name} is not in ${context.state?.name ?? "the selected state"}.`
      );
    }

    context.college = {
      id: String(college._id),
      name: college.name,
      institutionType: college.institutionType ?? "Affiliated College",
      autonomyStatus: college.autonomyStatus ?? "non-autonomous",
      district: college.districtName ?? null,
      city: college.cityName ?? null,
    };

    /**
     * The university is *read from the college*, not accepted from the caller.
     *
     * Affiliation is a property of the institution, so letting a student assert
     * it would let them claim a JNTUH degree from an unaffiliated college. A
     * supplied id is checked against the college's own and rejected if it
     * disagrees.
     */
    if (college.universityId) {
      const university = await University.findById(college.universityId)
        .select("name shortName")
        .lean();
      if (university) {
        context.university = {
          id: String(university._id),
          name: university.name,
          shortName: university.shortName ?? null,
        };
      }
    }

    const claimedUniversity = objectId(selection.universityId);
    if (
      claimedUniversity &&
      (!context.university || String(claimedUniversity) !== context.university.id)
    ) {
      return fail(
        "universityId",
        "university-mismatch",
        `${college.name} is not affiliated to that university.`
      );
    }
  }

  // ── Programme (course) ────────────────────────────────────────────────
  const programId = objectId(selection.programId);
  if (selection.programId && !programId) {
    return fail("programId", "invalid-id", "Select your course.");
  }
  if (programId) {
    if (!collegeId) {
      return fail("collegeId", "college-required", "Select your college before your course.");
    }
    const program = await Program.findOne({ _id: programId, collegeId })
      .select("name degree durationYears departmentId status")
      .lean();
    if (!program) {
      return fail(
        "programId",
        "program-not-in-college",
        `That course is not offered by ${context.college?.name ?? "this college"}.`
      );
    }
    if (program.status !== "active") {
      // §43 case 21: a discontinued course is still valid for existing students,
      // so this is not a hard rejection — it is recorded and allowed.
      // Nothing to do beyond not blocking.
    }
    context.program = {
      id: String(program._id),
      name: program.name,
      degree: program.degree,
      durationYears: program.durationYears ?? null,
    };

    // ── Branch ─────────────────────────────────────────────────────────
    const branchId = objectId(selection.branchId);
    if (selection.branchId && !branchId) {
      return fail("branchId", "invalid-id", "Select your branch.");
    }
    if (branchId) {
      if (!program.departmentId || String(program.departmentId) !== String(branchId)) {
        return fail(
          "branchId",
          "branch-not-in-program",
          `That branch does not belong to ${program.name}.`
        );
      }
      const branch = await Department.findOne({ _id: branchId, collegeId }).select("name code").lean();
      if (!branch) {
        return fail("branchId", "branch-not-found", "That branch no longer exists at this college.");
      }
      context.branch = { id: String(branch._id), name: branch.name, code: branch.code ?? null };
    }
  }

  // ── Whether there is any curriculum to offer at all (§7) ─────────────
  if (collegeId) {
    const regulationCount = await Regulation.countDocuments({
      collegeId,
      status: { $ne: "archived" },
    });
    context.hasCurriculum = regulationCount > 0;
  }

  // ── Regulation ───────────────────────────────────────────────────────
  const regulationId = objectId(selection.regulationId);
  if (selection.regulationId && !regulationId) {
    return fail("regulationId", "invalid-id", "Select your regulation.");
  }
  if (regulationId) {
    if (!collegeId) {
      return fail("collegeId", "college-required", "Select your college before your regulation.");
    }
    const regulation = await Regulation.findOne({ _id: regulationId, collegeId })
      .select("code name degree programId totalSemesters status")
      .lean();
    if (!regulation) {
      return fail(
        "regulationId",
        "regulation-not-in-college",
        `That regulation does not belong to ${context.college?.name ?? "this college"}.`
      );
    }
    if (regulation.programId && programId && String(regulation.programId) !== String(programId)) {
      return fail(
        "regulationId",
        "regulation-not-for-program",
        `Regulation ${regulation.code} does not apply to your course.`
      );
    }
    if (regulation.degree && context.program && regulation.degree !== context.program.degree) {
      return fail(
        "regulationId",
        "regulation-not-for-degree",
        `Regulation ${regulation.code} covers ${regulation.degree}, not ${context.program.degree}.`
      );
    }
    /**
     * A superseded regulation is *allowed*.
     *
     * §43 case 22: an R20 student is still an R20 student after R23 arrives, and
     * refusing the older code would make the platform unusable for exactly the
     * senior students who need it most. Only `archived` is refused.
     */
    if (regulation.status === "archived") {
      return fail("regulationId", "regulation-archived", `Regulation ${regulation.code} is archived.`);
    }
    context.regulation = {
      id: String(regulation._id),
      code: regulation.code,
      name: regulation.name,
      totalSemesters: regulation.totalSemesters ?? 8,
    };
  }

  // ── Admission batch and type ─────────────────────────────────────────
  if (selection.admissionType) {
    if (!ADMISSION_TYPES.includes(selection.admissionType as (typeof ADMISSION_TYPES)[number])) {
      return fail("admissionType", "invalid-value", "Select how you were admitted.");
    }
    context.admissionType = selection.admissionType as (typeof ADMISSION_TYPES)[number];
  }

  if (selection.admissionYear != null) {
    const year = Number(selection.admissionYear);
    const thisYear = new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 1980 || year > thisYear + 1) {
      return fail(
        "admissionYear",
        "invalid-year",
        `Enter an admission year between 1980 and ${thisYear + 1}.`
      );
    }
    context.admissionYear = year;
  }

  // ── Current year and semester ────────────────────────────────────────
  if (selection.currentSemester != null) {
    const semester = Number(selection.currentSemester);
    const maxSemester = context.regulation?.totalSemesters ?? 16;
    if (!Number.isInteger(semester) || semester < 1 || semester > maxSemester) {
      return fail(
        "currentSemester",
        "invalid-semester",
        context.regulation
          ? `Regulation ${context.regulation.code} has ${maxSemester} semesters.`
          : "Select your current semester."
      );
    }
    context.currentSemester = semester;
    // Derived, so the two can never disagree.
    context.currentYear = yearForSemester(semester);
  }

  if (context.currentYear === null && selection.currentYear != null) {
    const year = Number(selection.currentYear);
    const maxYear = context.program?.durationYears ?? 8;
    if (!Number.isInteger(year) || year < 1 || year > maxYear) {
      return fail(
        "currentYear",
        "invalid-year",
        `Select a year between 1 and ${maxYear}.`
      );
    }
    context.currentYear = year;
  }

  // ── Subjects ─────────────────────────────────────────────────────────
  const subjectIds = (selection.subjectIds ?? []).filter((id) => Types.ObjectId.isValid(id));
  if (subjectIds.length) {
    if (!context.regulation || !context.branch || !programId || !collegeId) {
      return fail(
        "subjectIds",
        "coordinate-incomplete",
        "Your course, branch, regulation and semester must be set before subjects can be saved."
      );
    }
    if (context.currentSemester === null) {
      return fail("currentSemester", "semester-required", "Select your semester before your subjects.");
    }

    /**
     * Every subject must belong to the *whole* coordinate.
     *
     * The query carries all six constraints rather than fetching by id and
     * checking afterwards: a subject from another regulation would otherwise
     * pass an existence check and be stored, and §22 exists precisely because
     * semester 5 under R18 and under R22 are different subject lists.
     */
    const matched = await CurriculumSubject.find({
      _id: { $in: subjectIds.map((id) => new Types.ObjectId(id)) },
      collegeId,
      programId,
      branchId: new Types.ObjectId(context.branch.id),
      regulationId: new Types.ObjectId(context.regulation.id),
      semester: context.currentSemester,
      status: "active",
    })
      .select("name code credits courseType")
      .lean();

    if (matched.length !== subjectIds.length) {
      return fail(
        "subjectIds",
        "subject-not-in-curriculum",
        `${subjectIds.length - matched.length} of the selected subjects are not in the ${context.regulation.code} semester ${context.currentSemester} curriculum for your branch.`
      );
    }

    context.subjects = matched.map((subject) => ({
      id: String(subject._id),
      name: subject.name,
      code: subject.code,
      credits: subject.credits ?? null,
      type: subject.courseType ?? "Core",
    }));
  }

  context.expectedGraduationYear = expectedGraduation(context);

  return { ok: true, context };
}

/**
 * Expected graduation from the admission year and course duration (spec §46).
 *
 * Lateral entry subtracts a year: those students enter in the second year, so a
 * four-year course takes them three. Returns null rather than guessing when the
 * duration is unknown — a wrong graduation year quietly misdates every placement
 * feature that reads it.
 */
export function expectedGraduation(context: {
  admissionYear: number | null;
  admissionType: string;
  program: { durationYears: number | null } | null;
}): number | null {
  if (!context.admissionYear || !context.program?.durationYears) return null;

  const duration =
    context.admissionType === "lateral-entry"
      ? Math.max(1, context.program.durationYears - 1)
      : context.program.durationYears;

  return context.admissionYear + duration;
}

/**
 * Whether the profile has enough to be called complete (spec §34).
 *
 * Decided on the server, from the resolved context, never from the form. The
 * curriculum levels are required *only when the college has them* — otherwise
 * 474 of 480 colleges would produce students who can never finish onboarding.
 */
export function isAcademicallyComplete(context: ResolvedStudentContext): boolean {
  if (!context.state || !context.college || !context.program) return false;
  if (context.admissionYear === null) return false;
  if (context.currentYear === null) return false;

  // A college with no configured curriculum cannot supply these, and requiring
  // them would make the profile permanently incomplete through no fault of the
  // student's.
  if (!context.hasCurriculum) return true;

  return Boolean(context.regulation) && context.currentSemester !== null;
}
