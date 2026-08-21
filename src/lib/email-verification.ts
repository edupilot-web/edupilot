import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { absoluteUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import { sendVerificationEmail, verificationTtlMinutes } from "@/lib/email/emailService";
import { consumeRateLimits, type RateLimitResult } from "@/lib/rate-limit";
import { EmailVerificationToken } from "@/models/EmailVerificationToken";
import { User } from "@/models/User";

/** 32 bytes of CSPRNG output, hex encoded — 256 bits in the link. */
const TOKEN_BYTES = 32;

/**
 * Resend limits.
 *
 * The cooldown stops a double-click or an impatient student mailing themselves
 * twice a second; the hourly cap stops an account being used as a relay to
 * bomb one inbox. The per-address rule matters as much as the per-user one:
 * "change email" can point a fresh account at somebody else's mailbox.
 */
const RESEND_COOLDOWN = { limit: 1, windowSeconds: 60 };
const RESEND_PER_HOUR = { limit: 5, windowSeconds: 60 * 60 };
const RESEND_PER_ADDRESS_PER_HOUR = { limit: 6, windowSeconds: 60 * 60 };

/** SHA-256 is the right primitive here: the input is already 256 random bits. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a fresh token and returns the raw value, which exists only for as long
 * as it takes to build the link — the database gets the hash.
 *
 * Any token already outstanding for the user is deleted first, so a resend
 * invalidates the earlier link rather than leaving several live at once.
 */
export async function issueVerificationToken(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  await connectDB();

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + verificationTtlMinutes() * 60_000);

  await EmailVerificationToken.deleteMany({ userId });
  await EmailVerificationToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

export function verificationUrlFor(token: string): string {
  return absoluteUrl(`/verify-email?token=${encodeURIComponent(token)}`);
}

export type VerificationOutcome =
  | { status: "verified"; userId: string }
  | { status: "already-verified"; userId: string }
  | { status: "expired" }
  | { status: "invalid" };

/**
 * Validates a token from a link and, if it holds up, marks the address verified.
 *
 * Single use: the row is deleted on success, so following the same link twice
 * lands on `already-verified` (the account is fine) rather than `invalid`, and
 * a link that was never good lands on `invalid` with nothing said about why.
 */
export async function verifyEmailToken(rawToken: string): Promise<VerificationOutcome> {
  // Cheap shape check first — a truncated or hand-typed value never reaches Mongo.
  if (typeof rawToken !== "string" || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return { status: "invalid" };
  }

  await connectDB();

  const tokenHash = hashToken(rawToken.toLowerCase());
  const record = await EmailVerificationToken.findOne({ tokenHash });

  if (!record) {
    // No row: either it was used and deleted, swept by the TTL index, or made
    // up. All three are the same message to the user.
    return { status: "invalid" };
  }

  // Belt and braces against a mismatched read; the query above already matched
  // on the hash, but comparing it in constant time costs nothing.
  if (!safeEqualHex(record.tokenHash, tokenHash)) return { status: "invalid" };

  if (record.expiresAt.getTime() <= Date.now()) {
    // Clear it out so the expired link cannot be retried, and the user is
    // pushed towards requesting a new one.
    await EmailVerificationToken.deleteOne({ _id: record._id });
    return { status: "expired" };
  }

  const userId = String(record.userId);
  const user = await User.findById(userId).select("emailVerified");
  if (!user) {
    // The account was deleted after the mail went out.
    await EmailVerificationToken.deleteOne({ _id: record._id });
    return { status: "invalid" };
  }

  const wasVerified = user.emailVerified === true;

  // Delete before flipping the flag: if the process dies between the two, a
  // spent link is dead rather than reusable.
  await EmailVerificationToken.deleteOne({ _id: record._id });
  if (!wasVerified) {
    await User.updateOne({ _id: userId }, { $set: { emailVerified: true } });
  }

  return { status: wasVerified ? "already-verified" : "verified", userId };
}

export type SendVerificationOutcome =
  | { status: "sent" }
  | { status: "already-verified" }
  | { status: "rate-limited"; retryAfterSeconds: number }
  | { status: "send-failed" };

/**
 * Issues a token and mails the link.
 *
 * `enforceRateLimit` is off for the send that follows sign-up — the account was
 * created a moment ago, the sign-up route is itself protected, and counting it
 * would spend the user's first resend before they had a chance to ask for one.
 */
export async function sendVerification(
  user: { id: string; email: string; name: string; emailVerified: boolean },
  { enforceRateLimit = true }: { enforceRateLimit?: boolean } = {}
): Promise<SendVerificationOutcome> {
  if (user.emailVerified) return { status: "already-verified" };

  if (enforceRateLimit) {
    const limited = await checkResendAllowance(user.id, user.email);
    if (!limited.allowed) {
      return { status: "rate-limited", retryAfterSeconds: limited.retryAfterSeconds };
    }
  }

  const { token } = await issueVerificationToken(user.id);

  const result = await sendVerificationEmail({
    email: user.email,
    name: user.name,
    verificationUrl: verificationUrlFor(token),
  });

  // The token stays valid on a delivery failure. The account is in a legitimate
  // state — exists, unverified — and the user can ask for another mail.
  return result.ok ? { status: "sent" } : { status: "send-failed" };
}

function checkResendAllowance(userId: string, email: string): Promise<RateLimitResult> {
  return consumeRateLimits([
    { key: `verify-email:cooldown:user:${userId}`, rule: RESEND_COOLDOWN },
    { key: `verify-email:hourly:user:${userId}`, rule: RESEND_PER_HOUR },
    { key: `verify-email:hourly:address:${email}`, rule: RESEND_PER_ADDRESS_PER_HOUR },
  ]);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
