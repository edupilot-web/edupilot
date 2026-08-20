import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Cookie carrying the state/nonce for the round trip. Deleted on callback. */
export const OAUTH_STATE_COOKIE = "edupilot_oauth";
export const OAUTH_STATE_MAX_AGE = 60 * 10; // 10 minutes

/** Cached across requests; the JWKS is fetched once and refreshed by jose. */
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local."
    );
  }
}

export function googleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GoogleNotConfiguredError();
  return { clientId, clientSecret };
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The redirect URI, derived from the incoming request so localhost and the
 * deployed origin both work. It must match one of the redirect URIs registered
 * in the Google Cloud console exactly.
 */
export function redirectUri(request: Request): string {
  return new URL("/api/auth/google/callback", new URL(request.url).origin).toString();
}

export function authorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  // Always show the chooser rather than silently reusing one Google session.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export type GoogleProfile = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
};

/**
 * Exchanges the authorization code and verifies the returned id_token against
 * Google's published keys. Verification is what makes the claims trustworthy —
 * the token is checked for signature, issuer, audience and our nonce.
 */
export async function exchangeCodeForProfile(params: {
  code: string;
  redirectUri: string;
  nonce: string;
}): Promise<GoogleProfile> {
  const { clientId, clientSecret } = googleCredentials();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const token = (await response.json()) as { id_token?: string };
  if (!token.id_token) throw new Error("Google token response contained no id_token");

  const { payload } = await jwtVerify(token.id_token, jwks, {
    issuer: ISSUERS,
    audience: clientId,
  });

  if (payload.nonce !== params.nonce) {
    throw new Error("Google id_token nonce did not match the one we sent");
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!payload.sub || !email) {
    throw new Error("Google id_token was missing the subject or email claim");
  }

  return {
    googleId: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    // Google omits `name` when the profile has none; the address is a usable fallback.
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name : email.split("@")[0],
    avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
  };
}
