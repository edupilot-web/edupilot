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

/** The three things a gate needs to know about the person asking. */
export type RoutingUser = {
  needsEmailVerification: boolean;
  profileCompleted: boolean;
};

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
  if (!user.profileCompleted) return withNext(ONBOARDING_FIRST_STEP, next);
  return safeDestination(next, DEFAULT_SIGNED_IN_DESTINATION);
}

/**
 * Whether `user` may see a screen inside the signed-in shell, and where to send
 * them if not. Null means "let them through".
 */
export function appGateRedirect(user: RoutingUser): string | null {
  if (user.needsEmailVerification) return VERIFY_EMAIL_PATH;
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
