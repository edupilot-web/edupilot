/**
 * Vocabularies for institution master data.
 *
 * Plain data with no mongoose import, so the admin forms (client components)
 * and the models can share one definition. Every list here is also editable as
 * master data in Settings → Institution; these constants are the seed and the
 * validation floor, not a hard-coded ceiling.
 */

/** What kind of institution it is. Drives which other fields apply. */
export const INSTITUTION_TYPES = [
  "University",
  "Autonomous College",
  "Affiliated College",
  "Constituent College",
  "Deemed University",
  "Institute of National Importance",
  "Standalone Institution",
  "Polytechnic",
  "Other",
] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

/** Who runs it. Separate from institution type — a private college can be autonomous. */
export const MANAGEMENT_TYPES = [
  "Government",
  "Government-Aided",
  "Private Unaided",
  "Private Aided",
  "Deemed",
  "Central",
  "State",
  "Trust",
  "Society",
  "Other",
] as const;
export type ManagementType = (typeof MANAGEMENT_TYPES)[number];

/**
 * Autonomy is a *status with a history*, not a boolean — see the
 * `AutonomyRecord` model. This enum is the current value of that history.
 */
export const AUTONOMY_STATUSES = [
  "autonomous",
  "non-autonomous",
  "pending-verification",
] as const;
export type AutonomyStatus = (typeof AUTONOMY_STATUSES)[number];

export const AUTONOMY_STATUS_LABELS: Record<AutonomyStatus, string> = {
  autonomous: "Autonomous",
  "non-autonomous": "Non-Autonomous",
  "pending-verification": "Pending Verification",
};

/** How a college relates to its parent body. Recorded per affiliation period. */
export const AFFILIATION_TYPES = [
  "affiliated",
  "autonomous",
  "constituent",
  "deemed",
  "recognised",
  "other",
] as const;
export type AffiliationType = (typeof AFFILIATION_TYPES)[number];

export const AFFILIATION_TYPE_LABELS: Record<AffiliationType, string> = {
  affiliated: "Affiliated",
  autonomous: "Autonomous",
  constituent: "Constituent",
  deemed: "Deemed",
  recognised: "Recognised",
  other: "Other",
};

/** Whether an affiliation period is the live one, over, or not yet in force. */
export const AFFILIATION_STATUSES = ["active", "expired", "terminated", "pending"] as const;
export type AffiliationStatus = (typeof AFFILIATION_STATUSES)[number];

export const UNIVERSITY_TYPES = [
  "Central University",
  "State University",
  "Private University",
  "Deemed University",
  "Institute of National Importance",
  "Open University",
  "Other",
] as const;
export type UniversityType = (typeof UNIVERSITY_TYPES)[number];

export const ACCREDITATION_BODIES = ["NAAC", "NBA", "NIRF", "UGC", "AICTE", "Other"] as const;
export type AccreditationBody = (typeof ACCREDITATION_BODIES)[number];

/** NAAC grades, the one most students recognise. Kept as free-ish text elsewhere. */
export const NAAC_GRADES = ["A++", "A+", "A", "B++", "B+", "B", "C", "D"] as const;

/**
 * The reusable verification lifecycle (spec §19). Applied to colleges,
 * universities, students and content, so all four read the same on screen and
 * the queues can be built from one shape.
 */
export const VERIFICATION_STATUSES = [
  "not-verified",
  "pending",
  "needs-review",
  "verified",
  "rejected",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * The two states that mean "waiting on an administrator".
 *
 * A named tuple rather than an inline array at each call site: assigned into a
 * `const filter` object, an inline `["pending", "needs-review"]` widens to
 * `string[]` and stops matching the schema's enum type.
 */
export const AWAITING_VERIFICATION: readonly VerificationStatus[] = [
  "pending",
  "needs-review",
];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  "not-verified": "Not Verified",
  pending: "Pending",
  "needs-review": "Needs Review",
  verified: "Verified",
  rejected: "Rejected",
};

/** Lifecycle of a record, independent of whether its data has been verified. */
export const RECORD_STATUSES = ["active", "inactive", "suspended", "archived"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const DEPARTMENT_STATUSES = ["active", "inactive"] as const;

/** Degree levels a program sits at. */
export const PROGRAM_LEVELS = [
  "Undergraduate",
  "Postgraduate",
  "Diploma",
  "Doctoral",
  "Certificate",
  "Integrated",
] as const;
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];

export const PROGRAM_MODES = ["Regular", "Distance", "Online", "Part-time", "Evening"] as const;
export type ProgramMode = (typeof PROGRAM_MODES)[number];

/** Longest sensible program: a 6-year integrated M.Tech, plus slack. */
export const MIN_PROGRAM_YEARS = 1;
export const MAX_PROGRAM_YEARS = 7;

/** Oldest establishment year we accept. India's oldest universities are 1857. */
export const MIN_ESTABLISHED_YEAR = 1800;
