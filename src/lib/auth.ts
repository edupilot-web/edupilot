import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import type { Role } from "@/models/User";

export { SESSION_COOKIE };

/** Default token lifetime, and the cookie lifetime when "Remember me" is on. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const REMEMBERED_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable. Add it to .env.local");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string;
  email: string;
  role: Role;
};

export async function signSession(
  payload: SessionPayload,
  ttlSeconds: number = SESSION_TTL_SECONDS
): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: payload.email as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/**
 * Writes the session cookie. `maxAge: null` omits Max-Age, which makes it a
 * session cookie the browser drops when it closes — that is what an unchecked
 * "Remember me" should do. The JWT still carries its own expiry either way.
 */
export async function setSessionCookie(
  token: string,
  { maxAge = SESSION_TTL_SECONDS }: { maxAge?: number | null } = {}
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(maxAge === null ? {} : { maxAge }),
  });
}

/**
 * Signs a token for `payload` and installs it as the session cookie.
 *
 * `remember: true`  -> 30 days, survives a browser restart.
 * `remember: false` -> 7-day token in a session cookie, dropped on browser close.
 * `remember` omitted -> 7-day persistent cookie (what API clients got before
 * the flag existed, so /api/auth/login without the field is unchanged).
 */
export async function startSession(
  payload: SessionPayload,
  { remember }: { remember?: boolean } = {}
): Promise<string> {
  const ttl = remember === true ? REMEMBERED_TTL_SECONDS : SESSION_TTL_SECONDS;
  const token = await signSession(payload, ttl);
  await setSessionCookie(token, { maxAge: remember === false ? null : ttl });
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Reads and verifies the session from the request cookie. Null when signed out. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
