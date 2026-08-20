import { NextResponse, type NextRequest } from "next/server";
import {
  GoogleNotConfiguredError,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE,
  authorizeUrl,
  googleCredentials,
  redirectUri,
} from "@/lib/google-oauth";
import { safeDestination } from "@/lib/redirects";

/**
 * Kicks off "Continue with Google". The state and nonce are minted here and
 * stashed in an httpOnly cookie so the callback can prove the response belongs
 * to this browser's request rather than to a forged one.
 */
export async function GET(request: NextRequest) {
  let clientId: string;
  try {
    ({ clientId } = googleCredentials());
  } catch (err) {
    if (err instanceof GoogleNotConfiguredError) {
      // Send the user back to a screen that can explain, rather than a raw 500.
      const url = new URL("/login", request.nextUrl.origin);
      url.searchParams.set("error", "google-unavailable");
      return NextResponse.redirect(url);
    }
    throw err;
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const next = safeDestination(request.nextUrl.searchParams.get("next"), "");

  const response = NextResponse.redirect(
    authorizeUrl({ clientId, redirectUri: redirectUri(request), state, nonce })
  );

  response.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE,
  });

  return response;
}
