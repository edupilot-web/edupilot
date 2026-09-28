import { DEFAULT_SIGNED_IN_DESTINATION, safeDestination } from "@/lib/redirects";

export const VERIFY_EMAIL_PATH = "/verify-email";
/**
 * Onboarding now starts at the academic flow.
 *
 * The old `/onboarding/education` step asked for the college as free text; the
 * academic flow collects it from the directory along with everything downstream,
 * so starting there would ask for the same thing twice and then discard the
 * typed version. The route is kept for anyone mid-flow on an old link.
 */
export const ONBOARDING_FIRST_STEP = "/onboarding/academic";
export const ONBOARDING_SECOND_STEP = "/onboarding/academic";
export const ONBOARDING_DONE_PATH = "/onboarding/complete";

/** What a gate needs to know about the person asking. */
export type RoutingUser = {
  needsEmailVerification: boolean;
  profileCompleted: boolean;
  /**
   * Optional, and only ever consulted to send a non-student somewhere else.
   *
   * Absent means "treat as a student", which keeps every caller that predates
   * teacher accounts correct: the student paths are the default and always were.
   */
  role?: string | null;
};

/**
 * Where a teacher belongs, whichever door they came through.
 *
 * `profileCompleted` means *student* onboarding, and a teacher will never
 * complete it because they have no `StudentProfile` and no reason to want one.
 * Without this, a teacher who signed in at the student login — which accepts
 * them, because the account and the session cookie are the same — was sent to
 * `/onboarding/academic` and asked for their admission year and branch. They
 * could complete it, and the result was a student profile attached to a
 * teacher's account.
 *
 * Routing them rather than refusing the login is deliberate. The teacher door
 * turns students away with the credential message so it cannot be used to
 * discover which addresses exist, but doing the same here would tell a teacher
 * their correct password was wrong.
 */
function elsewhereForRole(role: string | null | undefined): string | null {
  return role === "teacher" ? TEACHER_HOME : null;
}

const TEACHER_HOME = "/teacher/dashboard";

/**
 * Where a signed-in user belongs right now.
 *
 * Every gate in the app — the app shell, the onboarding layout, the sign-up
 * action, the Google callback — asks this one function, so they cannot disagree
 * about the order of the checks. Two gates each holding their own copy of
 * "verified? onboarded?" is exactly how a redirect loop starts.
 *
 * The order is deliberate and total: unverified first (nothing else can be
 * trusted about the account yet), then incomplete profile, then wherever the
 * user was actually trying to go.
 */
export function destinationFor(user: RoutingUser, next?: string | null): string {
  if (user.needsEmailVerification) return VERIFY_EMAIL_PATH;

  // After verification, before onboarding: a teacher has no student onboarding
  // to finish, so the question never applies to them.
  const byRole = elsewhereForRole(user.role);
  if (byRole) return byRole;

  if (!user.profileCompleted) return withNext(ONBOARDING_FIRST_STEP, next);
  return safeDestination(next, DEFAULT_SIGNED_IN_DESTINATION);
}

/**
 * Whether `user` may see a screen inside the signed-in shell, and where to send
 * them if not. Null means "let them through".
 */
export function appGateRedirect(user: RoutingUser): string | null {
  if (user.needsEmailVerification) return VERIFY_EMAIL_PATH;

  const byRole = elsewhereForRole(user.role);
  if (byRole) return byRole;

  if (!user.profileCompleted) return ONBOARDING_FIRST_STEP;
  return null;
}

/**
 * Carries a sanitised `?next=` through a step of the flow.
 *
 * `safeDestination` runs on the way in as well as on the way out: the value
 * arrives from a query string, and appending it unchecked would let a crafted
 * link turn an onboarding redirect into an off-site one.
 */
export function withNext(path: string, next?: string | null): string {
  if (!next) return path;
  const destination = safeDestination(next, "");
  if (!destination) return path;
  return `${path}?next=${encodeURIComponent(destination)}`;
}
