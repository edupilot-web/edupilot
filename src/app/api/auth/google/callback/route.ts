import { NextResponse, type NextRequest } from "next/server";
import { findOrCreateGoogleUser } from "@/lib/accounts";
import { startSession } from "@/lib/auth";
import { destinationFor } from "@/lib/auth-routing";
import { sendVerification } from "@/lib/email-verification";
import { OAUTH_STATE_COOKIE, exchangeCodeForProfile, redirectUri } from "@/lib/google-oauth";
import { isProfileCompleted } from "@/lib/student-profile";
import { needsEmailVerification } from "@/models/User";

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

    // Google has already established the identity behind the address, so the
    // usual case is `emailVerified: true` and no link at all — asking again
    // would strand someone who has no password to sign back in with. The
    // exception is an account whose `email_verified` claim came back false,
    // which is exactly the address we should not take Google's word for.
    const unverified = needsEmailVerification(user);
    if (unverified) {
      await sendVerification(
        {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          emailVerified: false,
        },
        { enforceRateLimit: false }
      );
    }

    // Onboarding first for a new account, or one abandoned midway; straight
    // through for anyone who has already finished.
    const destination = destinationFor(
      {
        needsEmailVerification: unverified,
        profileCompleted: unverified ? false : await isProfileCompleted(user._id.toString()),
        // Google sign-in reaches an existing teacher account too.
        role: user.role,
      },
      expected.next
    );

    const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("[auth] Google callback failed:", err);
    return failed(request, "google-failed");
  }
}
