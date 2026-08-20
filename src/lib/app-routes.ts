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
