import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { AcademicYear, Department, Program } from "@/models/AcademicStructure";
import {
  CurriculumSubject,
  Regulation,
  ordinal,
  semesterWithinYear,
  yearForSemester,
} from "@/models/Curriculum";
import { containsRegex } from "@/lib/admin/query";

/**
 * The academic cascade (spec §4).
 *
 * Seven steps, each one filtered by everything chosen before it. Every step is a
 * query rather than a lookup in a static map, because the answer genuinely
 * differs per college: two colleges affiliated to the same university can run
 * different branches, different regulations and different subject lists.
 *
 * **"Course" is a degree, not a row.** The platform's `Program` already carries
 * `degree` ("B.Tech") plus `departmentId` (the branch), so the specification's
 * `Course → Branch` is a *view* over data that exists rather than a new level to
 * store. Step 2 therefore returns distinct degrees, and step 3 returns the
 * departments that actually have a programme of that degree — which is also
 * where `programId` is resolved, so the caller never has to guess it.
 *
 * Nothing here trusts a name. Every step takes ids and returns ids; the labels
 * are for display only, and `resolveAcademicContext` in `ai/context.ts`
 * re-verifies the whole chain before anything is generated (§10, §26).
 */

const LIST_LIMIT = 200;

export type CascadeOption = {
  value: string;
  label: string;
  hint?: string;
  count?: number;
};

function objectId(value: string | null | undefined): Types.ObjectId | null {
  if (!value || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

// ── Step 1: College ───────────────────────────────────────────────────────

/**
 * Colleges that may hold curriculum content.
 *
 * Only `active` rows (§4 step 1). Archived and inactive colleges are excluded
 * because content generated against them could never be published to a student.
 */
export async function listCascadeColleges(search?: string): Promise<CascadeOption[]> {
  await connectDB();

  const filter: Record<string, unknown> = { status: "active" };
  if (search && search.trim().length >= 2) {
    const term = containsRegex(search.trim());
    filter.$or = [{ name: term }, { code: term }, { cityName: term }];
  }

  const rows = await College.find(filter)
    .select("name code districtName stateName")
    .sort({ name: 1 })
    .limit(LIST_LIMIT)
    .lean();

  return rows.map((row) => ({
    value: String(row._id),
    label: row.name,
    hint: [row.code, row.districtName, row.stateName].filter(Boolean).join(" · ") || undefined,
  }));
}

// ── Step 2: Course / Programme (a degree) ────────────────────────────────

/**
 * The degrees this college actually offers.
 *
 * Aggregated from `Program` rather than from a fixed degree list: a college that
 * runs only B.Tech must not be offered MBA, or the next two steps return empty
 * and the operator is left wondering which choice was wrong.
 */
export async function listCourses(collegeId: string): Promise<CascadeOption[]> {
  const college = objectId(collegeId);
  if (!college) return [];

  await connectDB();

  const rows = await Program.aggregate<{ _id: string; count: number; levels: string[] }>([
    { $match: { collegeId: college, status: "active" } },
    { $group: { _id: "$degree", count: { $sum: 1 }, levels: { $addToSet: "$level" } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return rows
    .filter((row) => row._id)
    .map((row) => ({
      value: row._id,
      label: row._id,
      hint: row.levels.filter(Boolean).join(", ") || undefined,
      count: row.count,
    }));
}

// ── Step 3: Branch (a department) ────────────────────────────────────────

export type BranchOption = CascadeOption & {
  /** Resolved here so the caller never has to derive it (§10). */
  programId: string;
  programName: string;
};

/**
 * The branches offering the chosen degree at the chosen college.
 *
 * Returns the programme id alongside each branch, because the (college, degree,
 * branch) triple identifies exactly one programme and the backend would
 * otherwise have to re-derive it on every subsequent call.
 */
export async function listBranches(collegeId: string, degree: string): Promise<BranchOption[]> {
  const college = objectId(collegeId);
  if (!college || !degree) return [];

  await connectDB();

  const programs = await Program.find({ collegeId: college, degree, status: "active" })
    .select("name departmentId specialization")
    .sort({ name: 1 })
    .limit(LIST_LIMIT)
    .lean();

  const departmentIds = programs.map((program) => program.departmentId).filter(Boolean);
  const departments = await Department.find({ _id: { $in: departmentIds } })
    .select("name code")
    .lean();

  const byId = new Map(departments.map((department) => [String(department._id), department]));

  const options: BranchOption[] = [];
  for (const program of programs) {
    if (!program.departmentId) continue;
    const department = byId.get(String(program.departmentId));
    if (!department) continue;

    options.push({
      value: String(department._id),
      label: department.name,
      hint: department.code ?? undefined,
      programId: String(program._id),
      programName: program.name,
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

// ── Step 4: Regulation ──────────────────────────────────────────────────

/**
 * Regulations applicable to this college, degree and branch (§4 step 4).
 *
 * A regulation may be scoped to one programme or left college-wide (a null
 * `programId`), so both are offered — a college-wide R23 governs every branch.
 * Archived regulations are hidden; superseded ones are not, because content for
 * an earlier cohort is still legitimately generated and reviewed.
 */
export async function listRegulations(
  collegeId: string,
  degree: string,
  programId?: string
): Promise<CascadeOption[]> {
  const college = objectId(collegeId);
  if (!college) return [];

  await connectDB();

  const program = objectId(programId ?? null);

  const rows = await Regulation.find({
    collegeId: college,
    status: { $ne: "archived" },
    $and: [
      { $or: [{ programId: null }, ...(program ? [{ programId: program }] : [])] },
      { $or: [{ degree: null }, { degree }] },
    ],
  })
    .select("code name effectiveFromYear effectiveToYear totalSemesters status subjectCount")
    .sort({ effectiveFromYear: -1 })
    .limit(50)
    .lean();

  return rows.map((row) => ({
    value: String(row._id),
    label: row.code,
    hint: [
      row.effectiveToYear
        ? `${row.effectiveFromYear}–${row.effectiveToYear}`
        : `${row.effectiveFromYear} onward`,
      row.status === "superseded" ? "superseded" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    count: row.subjectCount ?? undefined,
  }));
}

// ── Step 5: Academic year / batch ───────────────────────────────────────

/**
 * Academic years a regulation can be taught in (§4 step 5).
 *
 * Constrained by the regulation's own validity window: R20, superseded in 2023,
 * must not be offered against 2027-28. `AcademicYear` is a global calendar in
 * this platform, so the filtering is by date rather than by ownership.
 */
export async function listAcademicYears(regulationId?: string): Promise<CascadeOption[]> {
  await connectDB();

  const regulation = objectId(regulationId ?? null)
    ? await Regulation.findById(regulationId).select("effectiveFromYear effectiveToYear").lean()
    : null;

  const rows = await AcademicYear.find({ status: { $ne: "closed" } })
    .select("label startDate endDate isCurrent status")
    .sort({ startDate: -1 })
    .limit(20)
    .lean();

  return rows
    .filter((row) => {
      if (!regulation) return true;
      const startYear = new Date(row.startDate).getUTCFullYear();
      if (startYear < regulation.effectiveFromYear) return false;
      // `effectiveToYear` is the year the regulation stopped taking admissions;
      // a cohort admitted under it keeps studying for four more years, so the
      // window is extended rather than cut off at that year.
      if (regulation.effectiveToYear && startYear > regulation.effectiveToYear + 4) return false;
      return true;
    })
    .map((row) => ({
      value: String(row._id),
      label: row.label,
      hint: row.isCurrent ? "current" : row.status,
    }));
}

// ── Step 6: Year / semester ─────────────────────────────────────────────

export type SemesterOption = CascadeOption & { year: number; semester: number };

/**
 * The year/semester pairs the regulation defines (§4 step 6).
 *
 * Derived from `totalSemesters` rather than stored: a regulation states how many
 * semesters it runs, and enumerating rows for each would be a table that can
 * only ever be `1..n`. Only semesters that actually have subjects are offered,
 * so the operator is never sent to a dead end.
 */
export async function listSemesters(
  regulationId: string,
  branchId?: string
): Promise<SemesterOption[]> {
  const regulationObjectId = objectId(regulationId);
  if (!regulationObjectId) return [];

  await connectDB();

  const regulation = await Regulation.findById(regulationObjectId).select("totalSemesters").lean();
  if (!regulation) return [];

  const match: Record<string, unknown> = { regulationId: regulationObjectId, status: "active" };
  const branch = objectId(branchId ?? null);
  if (branch) match.branchId = branch;

  const populated = await CurriculumSubject.aggregate<{ _id: number; n: number }>([
    { $match: match },
    { $group: { _id: "$semester", n: { $sum: 1 } } },
  ]);
  const counts = new Map(populated.map((row) => [row._id, row.n]));

  const options: SemesterOption[] = [];
  for (let semester = 1; semester <= (regulation.totalSemesters ?? 8); semester += 1) {
    const count = counts.get(semester);
    if (!count) continue;
    const year = yearForSemester(semester);
    options.push({
      value: String(semester),
      label: `${ordinal(year)} Year / ${ordinal(semesterWithinYear(semester))} Semester`,
      hint: `Semester ${semester}`,
      year,
      semester,
      count,
    });
  }

  return options;
}

// ── Step 7: Subject ─────────────────────────────────────────────────────

export type SubjectQuery = {
  collegeId: string;
  programId: string;
  branchId: string;
  regulationId: string;
  semester: number;
};

/**
 * Subjects mapped to the exact academic coordinate (§4 step 7).
 *
 * Every one of the five ids is required. A query missing any of them would
 * silently widen — dropping `branchId` returns another branch's subjects, which
 * is precisely the leak §44 forbids — so an incomplete coordinate returns
 * nothing rather than something plausible.
 */
export async function listSubjects(query: SubjectQuery): Promise<CascadeOption[]> {
  const college = objectId(query.collegeId);
  const program = objectId(query.programId);
  const branch = objectId(query.branchId);
  const regulation = objectId(query.regulationId);

  if (!college || !program || !branch || !regulation) return [];
  if (!Number.isInteger(query.semester) || query.semester < 1) return [];

  await connectDB();

  const rows = await CurriculumSubject.find({
    collegeId: college,
    programId: program,
    branchId: branch,
    regulationId: regulation,
    semester: query.semester,
    status: "active",
  })
    .select("name code credits courseType units")
    .sort({ courseType: 1, name: 1 })
    .limit(LIST_LIMIT)
    .lean();

  return rows.map((row) => ({
    value: String(row._id),
    label: row.name,
    hint: [row.code, row.courseType, row.credits ? `${row.credits} credits` : null]
      .filter(Boolean)
      .join(" · "),
    count: row.units?.length || undefined,
  }));
}

// ── Subject detail (spec §6) ────────────────────────────────────────────

export type SubjectDetail = Awaited<ReturnType<typeof getSubjectDetail>>;

/**
 * Everything the subject information panel shows (§6).
 *
 * Read straight from the curriculum row — the administrator is never asked to
 * re-enter what the academic module already holds. Returns null rather than a
 * partial object when the subject does not exist, so a caller cannot render an
 * empty panel that looks like a subject with no syllabus.
 */
export async function getSubjectDetail(subjectId: string) {
  const subject = objectId(subjectId);
  if (!subject) return null;

  await connectDB();

  const row = await CurriculumSubject.findById(subject).lean();
  if (!row) return null;

  return {
    id: String(row._id),
    name: row.name,
    code: row.code,
    credits: row.credits,
    lectureHours: row.lectureHours,
    tutorialHours: row.tutorialHours,
    practicalHours: row.practicalHours,
    courseType: row.courseType,
    year: row.year,
    semester: row.semester,
    regulationCode: row.regulationCode,
    collegeName: row.collegeName,
    programName: row.programName,
    branchName: row.branchName,
    degree: row.degree,
    prerequisites: row.prerequisites ?? [],
    learningObjectives: row.learningObjectives ?? [],
    outcomes: row.outcomes ?? [],
    syllabusText: row.syllabusText,
    units: (row.units ?? []).map((unit) => ({
      unitNumber: unit.unitNumber,
      title: unit.title,
      description: unit.description ?? null,
      topics: unit.topics ?? [],
      hours: unit.hours ?? null,
    })),
    referenceBooks: (row.referenceBooks ?? []).map((book) => ({
      title: book.title,
      authors: book.authors ?? null,
      publisher: book.publisher ?? null,
      edition: book.edition ?? null,
      year: book.year ?? null,
      kind: book.kind ?? "textbook",
    })),
    referenceMaterials: row.referenceMaterials ?? [],
    ids: {
      collegeId: String(row.collegeId),
      programId: String(row.programId),
      branchId: String(row.branchId),
      regulationId: String(row.regulationId),
    },
    /** Whether there is a real syllabus to ground generation on (§9). */
    hasSyllabus: (row.units?.length ?? 0) > 0 || Boolean(row.syllabusText),
  };
}
