/**
 * User and student-profile field vocabularies as plain data.
 *
 * Kept out of the mongoose models so client components (the onboarding forms)
 * can import them without pulling mongoose into the browser bundle. The models
 * re-export them, so server-side imports can use either module.
 */
export const ROLES = ["student", "instructor", "admin", "teacher"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles a stranger may give themselves.
 *
 * `registerSchema` used to accept any member of `ROLES`, which meant
 * `POST /api/auth/register` would mint an `admin` — a documented gap
 * (TECHNICAL.md §8) that adding `teacher` would have widened into "anyone can
 * publish to a college's students". One entry, and it is the only role that
 * needs no authorisation from anybody.
 *
 * `teacher` is deliberately absent even though teachers self-register: they do
 * it through `/api/teacher/signup`, which sets the role server-side *and*
 * lands the account in `pending` behind a college's approval. The role alone
 * grants nothing; what it can reach is `TeacherAcademicAssignment`, which only
 * an administrator writes.
 */
export const SELF_SERVICE_ROLES = ["student"] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

/**
 * How the account signs in. `email` accounts own a password hash and must
 * verify their address; `google` accounts arrive with the address already
 * vouched for by the provider.
 */
export const AUTH_PROVIDERS = ["email", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** Offered in onboarding step 1. */
export const DEGREES = [
  "B.Tech",
  "B.E.",
  "B.Sc",
  "B.Com",
  "B.A.",
  "BBA",
  "BCA",
  "B.Pharm",
  "MBBS",
  "LLB",
  "M.Tech",
  "M.E.",
  "M.Sc",
  "M.Com",
  "M.A.",
  "MCA",
  "MBA",
  "PhD",
  "Diploma",
  "Other",
] as const;
export type Degree = (typeof DEGREES)[number];

/**
 * Suggestions for the specialization combobox, not a closed list: branch names
 * vary far too much between universities to enumerate, and forcing a student
 * into the nearest wrong option would poison the field for everyone reading it
 * later. Free text is accepted — these only save typing for the common cases.
 */
export const SPECIALIZATION_SUGGESTIONS = [
  "Computer Science and Engineering",
  "Information Technology",
  "Artificial Intelligence and Machine Learning",
  "Data Science",
  "Electronics and Communication Engineering",
  "Electrical and Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Chemical Engineering",
  "Aerospace Engineering",
  "Biotechnology",
  "Automobile Engineering",
  "Instrumentation Engineering",
  "Metallurgical Engineering",
  "Cyber Security",
  "Cloud Computing",
  "Internet of Things",
  "Robotics",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Statistics",
  "Economics",
  "Commerce",
  "Accounting and Finance",
  "Marketing",
  "Human Resources",
  "Operations",
  "Business Analytics",
  "English Literature",
  "Psychology",
  "Political Science",
  "Journalism and Mass Communication",
  "Design",
  "Architecture",
  "Pharmacy",
  "Nursing",
  "Law",
  "Agriculture",
  "Hotel Management",
] as const;

/**
 * Whether the student is mid-course or already out. This is the distinction the
 * onboarding form branches on: someone studying owes us a current year and an
 * *expected* graduation year, someone graduated owes us only the year they left.
 */
export const STUDY_STATUSES = ["studying", "graduated"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const MIN_STUDY_YEAR = 1;
export const MAX_STUDY_YEAR = 5;

/** Ordinal labels for the current-year selector — "1st Year", "2nd Year", … */
export const STUDY_YEAR_LABELS: Record<number, string> = {
  1: "1st Year",
  2: "2nd Year",
  3: "3rd Year",
  4: "4th Year",
  5: "5th Year",
};

/**
 * Oldest graduation year we will accept. Anything earlier is a typo rather than
 * a student, and the platform has nothing to offer someone who left in 1949.
 */
export const MIN_GRADUATION_YEAR = 1950;

/** How far ahead an *expected* graduation may sit. A 5-year course plus slack. */
export const MAX_GRADUATION_YEARS_AHEAD = 8;

/** Upper bound for the year selector, evaluated against the current year. */
export function maxGraduationYear(now: Date = new Date()): number {
  return now.getFullYear() + MAX_GRADUATION_YEARS_AHEAD;
}

/**
 * Years offered by the graduation selector, newest-relevant first.
 *
 * `studying` looks forward from this year; `graduated` looks back, because an
 * expected graduation in the past and a completed one in the future are both
 * nonsense and are better left out of the list than validated after the fact.
 */
export function graduationYearOptions(
  status: StudyStatus,
  now: Date = new Date()
): number[] {
  const year = now.getFullYear();
  if (status === "graduated") {
    const years: number[] = [];
    for (let value = year; value >= MIN_GRADUATION_YEAR; value -= 1) years.push(value);
    return years;
  }
  const years: number[] = [];
  for (let value = year; value <= maxGraduationYear(now); value += 1) years.push(value);
  return years;
}
