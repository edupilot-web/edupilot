import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { AcademicYear, Department, Program } from "@/models/AcademicStructure";
import { CurriculumSubject, Regulation, ordinal, semesterWithinYear } from "@/models/Curriculum";

/**
 * AIContextBuilder — resolve and *verify* an academic coordinate (spec §10, §26).
 *
 * The frontend sends ids and nothing else. It never sends a college name, a
 * subject title or a syllabus: those are looked up here, from the database, every
 * time. That is the single rule this file exists to enforce, because a caller
 * that could supply its own academic labels could ask for R23 content and have
 * it filed under R20, or generate one college's syllabus into another's library.
 *
 * Verification is a *chain*, not a set of existence checks (§26):
 *
 *   college exists
 *     → programme belongs to that college
 *       → branch is that programme's department
 *         → regulation belongs to the college and covers the degree
 *           → academic year is valid for the regulation
 *             → subject belongs to all of the above, at that semester
 *
 * Each link is checked against the row the previous link produced, so a caller
 * cannot mix ids that individually exist but do not belong together. The failure
 * message names the broken link, because "invalid context" tells an operator
 * nothing about which dropdown to change.
 */

export type AcademicContextInput = {
  collegeId: string;
  programId: string;
  branchId: string;
  regulationId: string;
  academicYearId: string;
  semester: number;
  subjectId: string;
};

export type ResolvedAcademicContext = {
  college: { id: string; name: string; code: string | null };
  program: { id: string; name: string; degree: string; level: string | null };
  branch: { id: string; name: string; code: string | null };
  regulation: { id: string; code: string; name: string; totalSemesters: number };
  academicYear: { id: string; label: string };
  year: number;
  semester: number;
  /** "2nd Year / 1st Semester" — the label §5 shows. */
  yearSemesterLabel: string;
  subject: {
    id: string;
    name: string;
    code: string;
    credits: number | null;
    lectureHours: number | null;
    tutorialHours: number | null;
    practicalHours: number | null;
    courseType: string;
    prerequisites: string[];
    learningObjectives: string[];
    outcomes: string[];
    syllabusText: string | null;
    units: { unitNumber: number; title: string; description: string | null; topics: string[]; hours: number | null }[];
    referenceBooks: {
      title: string;
      authors: string | null;
      publisher: string | null;
      edition: string | null;
      year: number | null;
      kind: string;
    }[];
    referenceMaterials: string[];
  };
  /** False when there is no syllabus to ground on — §9 refuses to invent one. */
  hasSyllabus: boolean;
};

export type ContextFailure = {
  /** Which link broke, so the UI can point at the right dropdown. */
  field:
    | "collegeId"
    | "programId"
    | "branchId"
    | "regulationId"
    | "academicYearId"
    | "semester"
    | "subjectId";
  message: string;
  code: string;
};

export type ContextResult =
  | { ok: true; context: ResolvedAcademicContext }
  | { ok: false; failure: ContextFailure };

function asObjectId(value: unknown): Types.ObjectId | null {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

function fail(field: ContextFailure["field"], code: string, message: string): ContextResult {
  return { ok: false, failure: { field, code, message } };
}

/**
 * Resolve the coordinate, or say precisely which link is broken.
 *
 * Sequential rather than parallel on purpose: each query is constrained by the
 * previous result, so running them together would mean checking membership
 * afterwards in application code — which is exactly the kind of check that gets
 * dropped during a refactor. Six round trips against indexed lookups is not the
 * bottleneck in a request that is about to call a language model.
 */
export async function resolveAcademicContext(
  input: AcademicContextInput
): Promise<ContextResult> {
  const collegeId = asObjectId(input.collegeId);
  const programId = asObjectId(input.programId);
  const branchId = asObjectId(input.branchId);
  const regulationId = asObjectId(input.regulationId);
  const academicYearId = asObjectId(input.academicYearId);
  const subjectId = asObjectId(input.subjectId);

  if (!collegeId) return fail("collegeId", "invalid-id", "Select a college.");
  if (!programId) return fail("programId", "invalid-id", "Select a course or programme.");
  if (!branchId) return fail("branchId", "invalid-id", "Select a branch.");
  if (!regulationId) return fail("regulationId", "invalid-id", "Select a regulation.");
  if (!academicYearId) return fail("academicYearId", "invalid-id", "Select an academic year.");
  if (!subjectId) return fail("subjectId", "invalid-id", "Select a subject.");

  const semester = Number(input.semester);
  if (!Number.isInteger(semester) || semester < 1 || semester > 16) {
    return fail("semester", "invalid-semester", "Select a year and semester.");
  }

  await connectDB();

  // 1 — College exists and is usable.
  const college = await College.findById(collegeId).select("name code status").lean();
  if (!college) return fail("collegeId", "college-not-found", "That college no longer exists.");
  if (college.status !== "active") {
    return fail(
      "collegeId",
      "college-inactive",
      `${college.name} is not active, so content cannot be generated for it.`
    );
  }

  // 2 — Programme belongs to *this* college.
  const program = await Program.findOne({ _id: programId, collegeId }).select("name degree level departmentId status").lean();
  if (!program) {
    return fail(
      "programId",
      "program-not-in-college",
      `That course is not offered by ${college.name}.`
    );
  }

  // 3 — Branch is the programme's own department.
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

  // 4 — Regulation belongs to the college, and covers this programme or degree.
  const regulation = await Regulation.findOne({ _id: regulationId, collegeId })
    .select("code name degree programId totalSemesters status effectiveFromYear effectiveToYear")
    .lean();
  if (!regulation) {
    return fail(
      "regulationId",
      "regulation-not-in-college",
      `That regulation does not belong to ${college.name}.`
    );
  }
  if (regulation.programId && String(regulation.programId) !== String(programId)) {
    return fail(
      "regulationId",
      "regulation-not-for-program",
      `Regulation ${regulation.code} does not apply to ${program.name}.`
    );
  }
  if (regulation.degree && regulation.degree !== program.degree) {
    return fail(
      "regulationId",
      "regulation-not-for-degree",
      `Regulation ${regulation.code} covers ${regulation.degree}, not ${program.degree}.`
    );
  }
  if (regulation.status === "archived") {
    return fail("regulationId", "regulation-archived", `Regulation ${regulation.code} is archived.`);
  }
  if (semester > (regulation.totalSemesters ?? 8)) {
    return fail(
      "semester",
      "semester-out-of-range",
      `Regulation ${regulation.code} has ${regulation.totalSemesters} semesters, so semester ${semester} does not exist.`
    );
  }

  // 5 — Academic year exists, is open, and falls inside the regulation's window.
  const academicYear = await AcademicYear.findById(academicYearId).select("label startDate status").lean();
  if (!academicYear) {
    return fail("academicYearId", "academic-year-not-found", "That academic year no longer exists.");
  }
  if (academicYear.status === "closed") {
    return fail(
      "academicYearId",
      "academic-year-closed",
      `${academicYear.label} is closed, so content cannot be generated for it.`
    );
  }
  const startYear = new Date(academicYear.startDate).getUTCFullYear();
  if (startYear < regulation.effectiveFromYear) {
    return fail(
      "academicYearId",
      "academic-year-before-regulation",
      `Regulation ${regulation.code} takes effect from ${regulation.effectiveFromYear}, after ${academicYear.label}.`
    );
  }

  // 6 — Subject belongs to the whole coordinate. The single most important
  //     check in the module: this is what stops one college's syllabus being
  //     generated under another's regulation (§44).
  const subject = await CurriculumSubject.findOne({
    _id: subjectId,
    collegeId,
    programId,
    branchId,
    regulationId,
    semester,
  }).lean();

  if (!subject) {
    // Distinguish "no such subject" from "not mapped here", because the second
    // is the message §26 asks for and the first means something else is wrong.
    const exists = await CurriculumSubject.findById(subjectId).select("name").lean();
    return fail(
      "subjectId",
      exists ? "subject-not-mapped" : "subject-not-found",
      exists
        ? `"${exists.name}" is not mapped to the selected college, regulation and semester.`
        : "That subject no longer exists."
    );
  }
  if (subject.status !== "active") {
    return fail("subjectId", "subject-inactive", `"${subject.name}" is not an active subject.`);
  }

  const units = (subject.units ?? []).map((unit) => ({
    unitNumber: unit.unitNumber,
    title: unit.title,
    description: unit.description ?? null,
    topics: unit.topics ?? [],
    hours: unit.hours ?? null,
  }));

  return {
    ok: true,
    context: {
      college: { id: String(college._id), name: college.name, code: college.code ?? null },
      program: {
        id: String(program._id),
        name: program.name,
        degree: program.degree,
        level: program.level ?? null,
      },
      branch: { id: String(branch._id), name: branch.name, code: branch.code ?? null },
      regulation: {
        id: String(regulation._id),
        code: regulation.code,
        name: regulation.name,
        totalSemesters: regulation.totalSemesters ?? 8,
      },
      academicYear: { id: String(academicYear._id), label: academicYear.label },
      year: subject.year,
      semester,
      yearSemesterLabel: `${ordinal(subject.year)} Year / ${ordinal(semesterWithinYear(semester))} Semester`,
      subject: {
        id: String(subject._id),
        name: subject.name,
        code: subject.code,
        credits: subject.credits ?? null,
        lectureHours: subject.lectureHours ?? null,
        tutorialHours: subject.tutorialHours ?? null,
        practicalHours: subject.practicalHours ?? null,
        courseType: subject.courseType ?? "Core",
        prerequisites: subject.prerequisites ?? [],
        learningObjectives: subject.learningObjectives ?? [],
        outcomes: subject.outcomes ?? [],
        syllabusText: subject.syllabusText ?? null,
        units,
        referenceBooks: (subject.referenceBooks ?? []).map((book) => ({
          title: book.title,
          authors: book.authors ?? null,
          publisher: book.publisher ?? null,
          edition: book.edition ?? null,
          year: book.year ?? null,
          kind: book.kind ?? "textbook",
        })),
        referenceMaterials: subject.referenceMaterials ?? [],
      },
      hasSyllabus: units.length > 0 || Boolean(subject.syllabusText),
    },
  };
}

/**
 * The default content level for a programme (§8, "Default based on the selected
 * course").
 *
 * Read from the programme's own level rather than guessed from the degree
 * string, so a college that files an integrated M.Tech as a postgraduate
 * programme gets the postgraduate default.
 */
export function defaultLevelForProgram(level: string | null): "beginner" | "intermediate" | "advanced" | "undergraduate" {
  if (!level) return "undergraduate";
  const normalised = level.toLowerCase();
  if (normalised.includes("post") || normalised.includes("pg") || normalised.includes("master")) {
    return "advanced";
  }
  if (normalised.includes("diploma") || normalised.includes("certificate")) return "beginner";
  return "undergraduate";
}
