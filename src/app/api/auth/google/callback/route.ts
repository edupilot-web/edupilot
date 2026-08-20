import { NextResponse, type NextRequest } from "next/server";
import { findOrCreateGoogleUser } from "@/lib/accounts";
import { startSession } from "@/lib/auth";
import { OAUTH_STATE_COOKIE, exchangeCodeForProfile, redirectUri } from "@/lib/google-oauth";
import { safeDestination } from "@/lib/redirects";

/** Sends the user back to sign-in with a code the page turns into a message. */
function failed(request: NextRequest, reason: string) {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // The user pressed "Cancel" on Google's consent screen.
  if (params.get("error")) return failed(request, "google-cancelled");

  const code = params.get("code");
  const state = params.get("state");
  const stored = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !stored) return failed(request, "google-failed");

  let expected: { state?: string; nonce?: string; next?: string };
  try {
    expected = JSON.parse(stored);
  } catch {
    return failed(request, "google-failed");
  }

  // Constant-time comparison is unnecessary here: the state is a random UUID
  // that the attacker would have to guess in full, not a secret to be probed.
  if (!expected.state || !expected.nonce || expected.state !== state) {
    return failed(request, "google-failed");
  }

  try {
    const profile = await exchangeCodeForProfile({
      code,
      redirectUri: redirectUri(request),
      nonce: expected.nonce,
    });

    const { user } = await findOrCreateGoogleUser(profile);

    await startSession(
      { sub: user._id.toString(), email: user.email, role: user.role },
      { remember: true }
    );

    // New accounts (and anyone who abandoned it) finish onboarding first; the
    // (onboarding) layout bounces them on if they are already done.
    const destination = user.onboardingCompletedAt
      ? safeDestination(expected.next)
      : `/onboarding/profile${expected.next ? `?next=${encodeURIComponent(expected.next)}` : ""}`;

    const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("[auth] Google callback failed:", err);
    return failed(request, "google-failed");
  }
}
