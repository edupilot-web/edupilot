import { MAX_STUDY_YEAR, MIN_STUDY_YEAR } from "@/lib/user-fields";

/**
 * Where a student is in their course, right now.
 *
 * One function, because every screen that personalises anything needs the
 * answer and two copies of this arithmetic would disagree within a semester.
 * The curriculum page, the dashboard and cohort analytics all ask here.
 *
 * The stored `currentYear` cannot be the answer on its own. It is a number the
 * student typed once during onboarding, and it is wrong from the next July
 * onwards — the profile in the database right now says "1st year" against a
 * 2023 admission, which in this academic year is a fourth-year student. So the
 * position is *derived* from the admission year, and the stored value is used
 * only where nothing better exists.
 */

/**
 * The month an Indian academic year turns over, zero-based: July.
 *
 * Colleges vary by a few weeks either side, and a student who returns in
 * mid-August is in the new year either way. Being wrong for the last fortnight
 * of June matters less than being a whole year wrong from July, which is what a
 * January boundary would do.
 */
const ACADEMIC_YEAR_START_MONTH = 6;

/** Semesters per study year. Every regulation in the data has two. */
const SEMESTERS_PER_YEAR = 2;

export type AdmissionType = "regular" | "lateral-entry" | "other";

export type PositionInput = {
  studyStatus?: string | null;
  admissionYear?: number | null;
  admissionType?: string | null;
  /** The value onboarding stored. Used only as a last resort — see below. */
  currentYear?: number | null;
  /** An explicit override, when the student has corrected their position. */
  currentSemester?: number | null;
  /** From the regulation, so the position cannot run past the course. */
  totalSemesters?: number | null;
  /** Course length in years, when the programme states it. */
  durationYears?: number | null;
};

/**
 * How the position was arrived at, so the screen can say so.
 *
 * A derived position is a guess the student should be able to correct, and one
 * taken from a stale stored year is a worse guess. Presenting either as settled
 * fact is how a student ends up reading the wrong semester's syllabus without
 * ever being offered the chance to notice.
 */
export type PositionSource =
  | "override"
  | "derived-from-admission"
  | "stored-year"
  | "graduated"
  | "unknown";

export type AcademicPosition = {
  year: number | null;
  semester: number | null;
  /** The semester's place within its year — semester 3 is the 1st of year 2. */
  semesterInYear: number | null;
  source: PositionSource;
  /** True when the derived position ran past the end of the course. */
  beyondCourse: boolean;
  /** True when `currentYear` disagrees with what the admission year implies. */
  storedYearConflicts: boolean;
};

/** The year an academic year is labelled by: 2026-27 is `2026`. */
export function academicYearStart(now: Date = new Date()): number {
  return now.getMonth() >= ACADEMIC_YEAR_START_MONTH
    ? now.getFullYear()
    : now.getFullYear() - 1;
}

/** 1 for the odd semester (July onward), 2 for the even one (January onward). */
export function semesterInCurrentYear(now: Date = new Date()): 1 | 2 {
  return now.getMonth() >= ACADEMIC_YEAR_START_MONTH ? 1 : 2;
}

/** The year a semester falls in: 3 → 2. Mirrors `yearForSemester` in Curriculum. */
export function yearOfSemester(semester: number): number {
  return Math.ceil(semester / SEMESTERS_PER_YEAR);
}

/** The semester's position inside its year: 3 → 1, 4 → 2. */
export function positionInYear(semester: number): 1 | 2 {
  return semester % SEMESTERS_PER_YEAR === 1 ? 1 : 2;
}

/**
 * Resolves the current year and semester.
 *
 * Precedence, strongest first:
 *
 *   1. `currentSemester` — an explicit correction. A transfer, a repeated year
 *      or a detained semester makes every formula wrong, and the student knows.
 *   2. The admission year — self-maintaining, and the only source that stays
 *      right as terms roll over.
 *   3. `currentYear` — stale by construction, but better than showing nothing
 *      to the profiles that have no admission year at all.
 *
 * Lateral entry adds a year: those students entered *into* the second year, so
 * one year elapsed since admission puts them in year 3, not year 2.
 */
export function resolveAcademicPosition(
  input: PositionInput,
  now: Date = new Date()
): AcademicPosition {
  const empty: AcademicPosition = {
    year: null,
    semester: null,
    semesterInYear: null,
    source: "unknown",
    beyondCourse: false,
    storedYearConflicts: false,
  };

  if (input.studyStatus === "graduated") {
    return { ...empty, source: "graduated" };
  }

  const cap = semesterCap(input);
  const derived = deriveFromAdmission(input, now);

  // Whether the stored year agrees with the admission year, computed before any
  // of them wins, because the screen wants to flag the disagreement regardless
  // of which one it ended up using.
  const storedYearConflicts =
    typeof input.currentYear === "number" &&
    derived !== null &&
    yearOfSemester(derived) !== input.currentYear;

  // 1 — an explicit override.
  if (typeof input.currentSemester === "number" && input.currentSemester >= 1) {
    const semester = Math.min(input.currentSemester, cap ?? input.currentSemester);
    return {
      year: yearOfSemester(semester),
      semester,
      semesterInYear: positionInYear(semester),
      source: "override",
      beyondCourse: cap !== null && input.currentSemester > cap,
      storedYearConflicts,
    };
  }

  // 2 — derived from the admission year.
  if (derived !== null) {
    const semester = cap !== null ? Math.min(derived, cap) : derived;
    return {
      year: yearOfSemester(semester),
      semester,
      semesterInYear: positionInYear(semester),
      source: "derived-from-admission",
      beyondCourse: cap !== null && derived > cap,
      storedYearConflicts,
    };
  }

  // 3 — the stored year, with no semester to go with it. Deliberately left
  // null rather than guessed at: showing the wrong half of a year's syllabus is
  // worse than showing the year and asking which semester.
  if (typeof input.currentYear === "number" && input.currentYear >= MIN_STUDY_YEAR) {
    const year = Math.min(input.currentYear, MAX_STUDY_YEAR);
    return {
      year,
      semester: null,
      semesterInYear: null,
      source: "stored-year",
      beyondCourse: false,
      storedYearConflicts: false,
    };
  }

  return empty;
}

/**
 * The semester the admission year implies, before any clamping.
 *
 * Returns null when there is no admission year, or when the arithmetic lands
 * before the course started — a future admission year is a typo, and treating
 * it as "semester 0" would be a confident wrong answer.
 */
function deriveFromAdmission(input: PositionInput, now: Date): number | null {
  const admissionYear = input.admissionYear;
  if (typeof admissionYear !== "number" || admissionYear < 1980) return null;

  const elapsed = academicYearStart(now) - admissionYear;
  if (elapsed < 0) return null;

  const lateralOffset = input.admissionType === "lateral-entry" ? 1 : 0;
  const studyYear = elapsed + 1 + lateralOffset;

  const semester = (studyYear - 1) * SEMESTERS_PER_YEAR + semesterInCurrentYear(now);
  return semester >= 1 ? semester : null;
}

/**
 * The last semester of the course.
 *
 * The regulation's own `totalSemesters` first, since that is the college's
 * statement of its own course. `durationYears` is the fallback, and the global
 * maximum the last resort — without a cap, a 2015 admission with a stale
 * profile resolves to semester 23 and the subject query returns nothing with no
 * indication why.
 */
function semesterCap(input: PositionInput): number | null {
  if (typeof input.totalSemesters === "number" && input.totalSemesters >= 1) {
    return input.totalSemesters;
  }
  if (typeof input.durationYears === "number" && input.durationYears >= 1) {
    return input.durationYears * SEMESTERS_PER_YEAR;
  }
  return MAX_STUDY_YEAR * SEMESTERS_PER_YEAR;
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/** "2nd Year · 1st Semester", or just the year when the semester is unknown. */
export function positionLabel(position: AcademicPosition): string {
  if (position.source === "graduated") return "Graduated";
  if (position.year === null) return "Year not set";

  const year = `${ORDINALS[position.year] ?? `${position.year}th`} Year`;
  if (position.semesterInYear === null) return year;
  return `${year} · ${ORDINALS[position.semesterInYear]} Semester`;
}

/** "Semester 3 of 8" — the absolute position, for progress affordances. */
export function semesterLabel(
  position: AcademicPosition,
  totalSemesters?: number | null
): string | null {
  if (position.semester === null) return null;
  if (typeof totalSemesters === "number" && totalSemesters >= 1) {
    return `Semester ${position.semester} of ${totalSemesters}`;
  }
  return `Semester ${position.semester}`;
}
