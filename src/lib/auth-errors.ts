/**
 * Messages for the `?error=` codes the Google routes redirect back with.
 * Kept here so the login and sign-up pages phrase them identically.
 */
const MESSAGES: Record<string, string> = {
  "google-unavailable":
    "Google sign-in is not configured on this deployment yet. Please use your email and password.",
  "google-cancelled": "Google sign-in was cancelled. You can try again or use your email and password.",
  "google-failed": "We could not complete Google sign-in. Please try again or use your email and password.",
};

export function authErrorMessage(code: unknown): string | undefined {
  return typeof code === "string" ? MESSAGES[code] : undefined;
}
