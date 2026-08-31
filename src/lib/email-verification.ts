import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { absoluteUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import { sendVerificationEmail, verificationTtlMinutes } from "@/lib/email/emailService";
import { consumeRateLimit, consumeRateLimits, type RateLimitResult } from "@/lib/rate-limit";
import { VERIFICATION_CODE_LENGTH } from "@/lib/verification-code";
import { EmailVerificationToken } from "@/models/EmailVerificationToken";
import { User } from "@/models/User";

/** 32 bytes of CSPRNG output, hex encoded — 256 bits in the link. */
const TOKEN_BYTES = 32;

/** Digits in the code the student types, shared with the screen that asks for it. */
const CODE_DIGITS = VERIFICATION_CODE_LENGTH;

/**
 * Wrong codes allowed against one issued code before it is destroyed.
 *
 * Six digits is a million possibilities, so this plus the resend cap is what
 * makes guessing hopeless: five tries per code and five codes an hour is 25
 * guesses against 1,000,000 — a 0.0025% chance in an hour of trying.
 */
export const MAX_CODE_ATTEMPTS = 5;

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

/**
 * Ceiling on code submissions per account per hour.
 *
 * Sits above the per-code `MAX_CODE_ATTEMPTS`: that one dies with its code, so
 * without this a script could resend and spend a fresh five attempts each time.
 * Generous enough that a student fat-fingering the code never meets it.
 */
const CODE_ATTEMPTS_PER_HOUR = { limit: 20, windowSeconds: 60 * 60 };

/** SHA-256 is the right primitive here: the input is already 256 random bits. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The code is keyed, not merely hashed.
 *
 * A plain SHA-256 of six digits is not a one-way function in any useful sense:
 * a dump of this collection could be matched against all million pre-images in
 * well under a second. An HMAC under a secret that is not in the dump has no
 * such shortcut. `EMAIL_OTP_SECRET` exists for deployments that want the key
 * separated; falling back to `JWT_SECRET` keeps this working with no new
 * configuration, and the label below keeps the two uses from ever producing
 * the same output over the same input.
 */
function hashCode(code: string): string {
  const secret = process.env.EMAIL_OTP_SECRET?.trim() || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Missing JWT_SECRET (or EMAIL_OTP_SECRET) environment variable. Add it to .env.local"
    );
  }
  return createHmac("sha256", secret).update(`email-otp:v1:${code}`).digest("hex");
}

/**
 * A uniformly random `CODE_DIGITS`-digit string, leading zeros kept.
 *
 * `randomInt` is rejection-sampled by Node, so there is none of the modulo bias
 * that `randomBytes(4) % 1000000` would introduce — which would make some codes
 * likelier than others and hand a guesser an edge.
 */
function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
}

/**
 * Issues a fresh code and link, returning the raw values — which exist only for
 * as long as it takes to render the email. The database gets the hashes.
 *
 * Both are minted together and stored on one row: the student may type the code
 * or click the link, and either way it is the same pending confirmation, with
 * one expiry and one attempt counter. Anything already outstanding for the user
 * is deleted first, so a resend invalidates the previous code rather than
 * leaving several live at once.
 */
export async function issueVerification(userId: string): Promise<{
  token: string;
  code: string;
  expiresAt: Date;
}> {
  await connectDB();

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const code = generateCode();
  const expiresAt = new Date(Date.now() + verificationTtlMinutes() * 60_000);

  await EmailVerificationToken.deleteMany({ userId });
  await EmailVerificationToken.create({
    userId,
    tokenHash: hashToken(token),
    codeHash: hashCode(code),
    attempts: 0,
    expiresAt,
  });

  return { token, code, expiresAt };
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
 * What typing a code can lead to.
 *
 * Distinct from `VerificationOutcome` because the code path can say things the
 * link path cannot: how many tries are left, and that the code has just been
 * burnt for having too many wrong ones.
 */
export type CodeVerificationOutcome =
  | { status: "verified" }
  | { status: "already-verified" }
  | { status: "expired" }
  | { status: "no-code" }
  | { status: "incorrect"; attemptsRemaining: number }
  | { status: "too-many-attempts" }
  | { status: "rate-limited"; retryAfterSeconds: number };

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

/**
 * Attempts a code the student typed, for the account they are signed in as.
 *
 * Scoped to `userId` rather than looked up by the code itself, which matters
 * twice: two students can hold the same six digits at the same time without
 * either being able to use the other's, and there is no query here that a
 * stranger could aim at somebody else's account.
 *
 * Wrong guesses are counted on the row and the row is destroyed once they run
 * out, so a code cannot be worn down indefinitely.
 */
export async function verifyEmailCode(
  userId: string,
  rawCode: string
): Promise<CodeVerificationOutcome> {
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";

  // Rate limit before touching the row: this runs on every submission,
  // including the malformed ones, so a script cannot use cheap rejections to
  // probe timing or to keep the database busy.
  const allowance = await consumeRateLimit(`verify-email:code:user:${userId}`, CODE_ATTEMPTS_PER_HOUR);
  if (!allowance.allowed) {
    return { status: "rate-limited", retryAfterSeconds: allowance.retryAfterSeconds };
  }

  await connectDB();

  const user = await User.findById(userId).select("emailVerified");
  if (!user) return { status: "no-code" };
  if (user.emailVerified === true) return { status: "already-verified" };

  const record = await EmailVerificationToken.findOne({ userId });
  if (!record) return { status: "no-code" };

  if (record.expiresAt.getTime() <= Date.now()) {
    await EmailVerificationToken.deleteOne({ _id: record._id });
    return { status: "expired" };
  }

  // Shape check after the row is known to exist, so a short or mistyped code
  // still costs an attempt. Letting malformed input through for free would give
  // a guesser unlimited probes at the surrounding logic. Non-digits were
  // stripped above, so length is the whole of well-formedness here.
  const wellFormed = code.length === CODE_DIGITS;

  if (!wellFormed || !safeEqualHex(record.codeHash, hashCode(code))) {
    const attempts = (record.attempts ?? 0) + 1;

    if (attempts >= MAX_CODE_ATTEMPTS) {
      // Out of tries: destroy the code rather than leave it sitting there with
      // a counter somebody might find a way to reset.
      await EmailVerificationToken.deleteOne({ _id: record._id });
      return { status: "too-many-attempts" };
    }

    await EmailVerificationToken.updateOne({ _id: record._id }, { $set: { attempts } });
    return { status: "incorrect", attemptsRemaining: MAX_CODE_ATTEMPTS - attempts };
  }

  // Correct. Delete before flipping the flag, for the same reason the link path
  // does: if the process dies between the two, a spent code is dead rather
  // than reusable.
  await EmailVerificationToken.deleteOne({ _id: record._id });
  await User.updateOne({ _id: userId }, { $set: { emailVerified: true } });

  return { status: "verified" };
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

  const { token, code } = await issueVerification(user.id);

  const result = await sendVerificationEmail({
    email: user.email,
    name: user.name,
    code,
    verificationUrl: verificationUrlFor(token),
  });

  // The code stays valid on a delivery failure. The account is in a legitimate
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
