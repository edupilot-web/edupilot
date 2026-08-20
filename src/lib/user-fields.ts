/**
 * User field vocabularies as plain data.
 *
 * Kept out of `models/User.ts` so client components (the onboarding forms) can
 * import them without pulling mongoose into the browser bundle. The model
 * re-exports them, so server-side imports can use either module.
 */
export const ROLES = ["student", "instructor", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Sign-in methods. A Google account has no password of its own. */
export const AUTH_PROVIDERS = ["password", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** Offered in the education step of onboarding. */
export const PROGRAMS = [
  "B.Tech",
  "B.E.",
  "B.Sc",
  "B.Com",
  "B.A.",
  "BCA",
  "M.Tech",
  "M.Sc",
  "MCA",
  "MBA",
  "PhD",
  "Other",
] as const;
export type Program = (typeof PROGRAMS)[number];

export const MIN_STUDY_YEAR = 1;
export const MAX_STUDY_YEAR = 5;
