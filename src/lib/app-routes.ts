/**
 * Every route behind the signed-in shell.
 *
 * Plain strings with no React imports, so `proxy.ts` can use the list to decide
 * what needs a session without dragging components into the proxy bundle.
 * `src/components/app/nav.ts` builds the sidebar from these same constants, so
 * the two cannot drift apart.
 */
export const APP_ROUTES = {
  dashboard: "/dashboard",
  /** Signed-in but outside the app shell, so nav.ts leaves it out of the sidebar. */
  onboarding: "/onboarding",
  aiTutor: "/ai-tutor",
  scoreBooster: "/score-booster",
  mockInterviews: "/mock-interviews",
  curriculum: "/curriculum",
  assignments: "/assignments",
  notes: "/notes",
  notifications: "/notifications",
  timetable: "/timetable",
  noticeBoard: "/notice-board",
  events: "/events",
  placements: "/placements",
  wallet: "/wallet",
  refer: "/refer",
  serviceRequests: "/service-requests",
  profile: "/profile",
  settings: "/settings",
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

export const PROTECTED_PATHS: readonly string[] = Object.values(APP_ROUTES);

/**
 * The teacher application.
 *
 * A separate list because it is a separate shell with a separate gate: these
 * routes need a session *and* the teacher role, which `(teacher)/layout.tsx`
 * checks. `/teacher/login` and `/teacher/signup` are deliberately absent —
 * they are how a teacher gets a session in the first place.
 */
export const TEACHER_ROUTES = {
  dashboard: "/teacher/dashboard",
  assignments: "/teacher/assignments",
  notes: "/teacher/notes",
  students: "/teacher/students",
  profile: "/teacher/profile",
} as const;

export const TEACHER_PROTECTED_PATHS: readonly string[] = Object.values(TEACHER_ROUTES);
