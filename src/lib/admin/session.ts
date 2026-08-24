import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Admin sessions, kept entirely separate from student sessions.
 *
 * A different cookie, a different claim set, and a different (much shorter)
 * lifetime. The separation is the point: a bug in the student session code
 * cannot mint something the admin app will accept, because the admin verifier
 * requires a `typ: "admin"` claim that the student signer never sets.
 */
export const ADMIN_SESSION_COOKIE = "edupilot_admin_session";

/**
 * Eight hours — a working day. Long enough not to interrupt a shift, short
 * enough that a laptop left open overnight is not a standing key to the
 * platform. Overridable from Settings → Security.
 */
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

/** Idle timeout. A session untouched for this long is treated as expired. */
export const ADMIN_IDLE_TIMEOUT_SECONDS = 60 * 60 * 2;

const TOKEN_TYPE = "admin";

function secretKey(): Uint8Array {
  // Falls back to JWT_SECRET so a fresh clone works, but the two should differ
  // in any real deployment: one secret means a compromised student token
  // signing key is also an admin one.
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Missing ADMIN_JWT_SECRET (or JWT_SECRET) environment variable. Add it to .env.local"
    );
  }
  return new TextEncoder().encode(secret);
}

export type AdminSessionPayload = {
  sub: string;
  email: string;
  roleSlug: string;
  /** Seconds since epoch of the last request that touched this session. */
  seenAt: number;
};

export async function signAdminSession(
  payload: Omit<AdminSessionPayload, "seenAt">,
  ttlSeconds: number = ADMIN_SESSION_TTL_SECONDS
): Promise<string> {
  return new SignJWT({
    typ: TOKEN_TYPE,
    email: payload.email,
    roleSlug: payload.roleSlug,
    seenAt: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyAdminSession(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    // A student token verifies against the same secret when ADMIN_JWT_SECRET is
    // not set. This claim is what stops it being accepted here.
    if (payload.typ !== TOKEN_TYPE || !payload.sub) return null;

    const seenAt = typeof payload.seenAt === "number" ? payload.seenAt : 0;
    if (Math.floor(Date.now() / 1000) - seenAt > ADMIN_IDLE_TIMEOUT_SECONDS) return null;

    return {
      sub: payload.sub,
      email: payload.email as string,
      roleSlug: payload.roleSlug as string,
      seenAt,
    };
  } catch {
    return null;
  }
}

export async function startAdminSession(
  payload: Omit<AdminSessionPayload, "seenAt">
): Promise<string> {
  const token = await signAdminSession(payload);
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // `strict`, not `lax`: nothing should ever navigate into the admin app from
    // another site carrying a live session. There is no OAuth round trip here
    // that would need to survive a cross-site redirect.
    sameSite: "strict",
    path: "/admin",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return token;
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete({ name: ADMIN_SESSION_COOKIE, path: "/admin" });
}

/** Reads and verifies the admin session from the request cookie. */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}
