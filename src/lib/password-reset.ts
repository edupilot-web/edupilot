import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { PasswordResetToken } from "@/models/PasswordResetToken";
import { User } from "@/models/User";
import { absoluteUrl } from "@/lib/app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendNoPasswordEmail, sendPasswordResetEmail } from "@/lib/email/emailService";

/**
 * Password reset.
 *
 * The one flow where the product hands over an account, so the rules are
 * stricter than anywhere else and every one of them is deliberate.
 *
 * ## The request tells you nothing
 *
 * `requestReset` returns the same thing whether or not the address has an
 * account. Anything else turns this endpoint into a way to ask "is this person
 * a student here?" about any address in the world — and the answer is worth
 * having, because it is a list of people to phish.
 *
 * ## The link is the only credential
 *
 * No six-digit code, unlike email verification. Confirming an address proves
 * someone can read a mailbox; resetting a password hands over the account, and a
 * million-possibility code is a reasonable online-guessing surface for the first
 * and not for the second.
 *
 * ## A reset revokes every session
 *
 * Someone resetting a password often believes another person is in their
 * account. A reset that left those sessions working would be theatre.
 */

const TOKEN_BYTES = 32;
const BCRYPT_ROUNDS = 12;

/**
 * An hour.
 *
 * Long enough to survive a mail queue and somebody reading it after lunch,
 * short enough that a link sitting in an unattended inbox stops being a key to
 * the account by the end of the afternoon.
 */
export const RESET_TTL_MINUTES = 60;

/**
 * Per address, and per address per hour.
 *
 * The cooldown stops a form being used to mail-bomb somebody, which is the real
 * abuse here: the requester needs no account and no session, so the only cost to
 * them is the request itself.
 */
const REQUEST_COOLDOWN = { limit: 1, windowSeconds: 60 };
const REQUESTS_PER_HOUR = { limit: 5, windowSeconds: 60 * 60 };

/** SHA-256 is right here: the input is already 256 random bits. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetUrlFor(token: string): string {
  return absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`);
}

export type RequestOutcome =
  | { ok: true }
  /** The address is being asked about too often. Still says nothing about it. */
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

/**
 * Send a reset link, if there is anywhere to send it.
 *
 * Returns `ok` for an address with no account, and does so **without** sending
 * anything. The caller renders the same confirmation either way.
 */
export async function requestReset(rawEmail: string): Promise<RequestOutcome> {
  const email = rawEmail.trim().toLowerCase();

  /**
   * Rate limited on the address, before the lookup.
   *
   * Keyed on what was typed rather than on a resolved user, so an address with
   * no account is limited exactly like one with an account. Limiting only real
   * users would make the *rate limit* the oracle the neutral response exists to
   * close.
   */
  const [cooldown, hourly] = await Promise.all([
    consumeRateLimit(`pwreset:cooldown:${email}`, REQUEST_COOLDOWN),
    consumeRateLimit(`pwreset:hour:${email}`, REQUESTS_PER_HOUR),
  ]);

  if (!cooldown.allowed || !hourly.allowed) {
    return {
      ok: false,
      reason: "rate-limited",
      retryAfterSeconds: Math.max(cooldown.retryAfterSeconds, hourly.retryAfterSeconds),
    };
  }

  await connectDB();
  const user = await User.findOne({ email }).select("name email googleId").lean();

  // No account. Nothing sent, nothing said.
  if (!user) return { ok: true };

  /**
   * A Google account has no password to reset.
   *
   * Mail is still sent, and this is the point: the *requester* learns nothing
   * either way, while the person who actually holds the mailbox is told why the
   * reset screen will not help them and what to do instead. Refusing at the form
   * would leak which addresses are Google accounts.
   */
  if (user.googleId) {
    await sendNoPasswordEmail({ email: user.email, name: user.name });
    return { ok: true };
  }

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);

  /**
   * Any outstanding link is invalidated first.
   *
   * Two live reset links for one account is two chances for an old mail to be
   * found later and used. A new request means the previous one is abandoned.
   */
  await PasswordResetToken.deleteMany({ userId: user._id });
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(token),
    sentTo: user.email,
    expiresAt,
  });

  const sent = await sendPasswordResetEmail({
    email: user.email,
    name: user.name,
    resetUrl: resetUrlFor(token),
    expiresInMinutes: RESET_TTL_MINUTES,
  });

  if (!sent.ok) {
    /**
     * The row is removed when the mail could not go.
     *
     * A token nobody received is a credential sitting in the database with no
     * owner. Leaving it would also mean the next request is refused by the
     * cooldown while the student has nothing to show for the first.
     */
    await PasswordResetToken.deleteMany({ userId: user._id });
    console.error("[password-reset] could not send to", user.email, sent.error);
  }

  return { ok: true };
}

export type TokenCheck =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "email-changed" };

/**
 * Is this link still good?
 *
 * Used by the reset screen before it shows a form, so somebody with a stale link
 * is told so rather than typing a new password twice and then being refused.
 */
export async function checkResetToken(rawToken: string): Promise<TokenCheck> {
  await connectDB();

  if (!rawToken || rawToken.length < 32) return { ok: false, reason: "invalid" };

  const row = await PasswordResetToken.findOne({ tokenHash: hashToken(rawToken) }).lean();
  if (!row) return { ok: false, reason: "invalid" };

  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const user = await User.findById(row.userId).select("email").lean();
  if (!user) return { ok: false, reason: "invalid" };

  /**
   * The address must still be the one the link was sent to.
   *
   * The link proves control of *that* mailbox. If the account has since moved to
   * another address, the authority the link represents has moved with it.
   */
  if (user.email !== row.sentTo) return { ok: false, reason: "email-changed" };

  return { ok: true, userId: String(row.userId), email: user.email };
}

export type ResetOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "used" | "email-changed" | "weak" };

/**
 * Set the new password and spend the link.
 *
 * Order matters. The token is marked used **before** the password is written, so
 * two requests racing on one link cannot both proceed — the second finds it
 * spent. Writing the password first and marking afterwards would let a doubled
 * submit run the update twice, which is harmless here but would not be if this
 * ever did anything else.
 */
export async function consumeReset(
  rawToken: string,
  newPassword: string
): Promise<ResetOutcome> {
  const check = await checkResetToken(rawToken);
  if (!check.ok) return check;

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return { ok: false, reason: "weak" };
  }

  /**
   * Claim the token with a conditional update.
   *
   * `usedAt: null` in the filter makes "is it unused" and "mark it used" one
   * atomic operation. A read followed by a write would let two concurrent
   * submissions both pass the check.
   */
  const claimed = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashToken(rawToken), usedAt: null },
    { $set: { usedAt: new Date() } },
    { returnDocument: "after" }
  ).lean();

  if (!claimed) return { ok: false, reason: "used" };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await User.updateOne(
    { _id: check.userId },
    {
      $set: {
        passwordHash,
        /**
         * Every session issued before now stops working.
         *
         * Including the one the person resetting is holding, if any. Signing
         * them back in would be friendlier and would also mean an attacker who
         * triggered the reset keeps their seat; being logged out and asked to
         * sign in with the new password is the correct outcome for everybody.
         */
        sessionsValidFrom: new Date(),
        /**
         * A reset proves the address works, which is the same thing
         * verification proves. Leaving an unverified account unverified after
         * it has just demonstrated mailbox control would be asking twice.
         */
        emailVerified: true,
      },
    }
  );

  return { ok: true };
}

/**
 * Whether a session minted at `issuedAt` is still honoured.
 *
 * Exported for the gates. A one-second grace absorbs the rounding in a JWT's
 * `iat`, which is whole seconds: without it, a session issued in the same second
 * as a reset could be refused by a few hundred milliseconds.
 */
export function sessionIsFresh(
  issuedAtSeconds: number | undefined,
  validFrom: Date | null | undefined
): boolean {
  if (!validFrom) return true;
  if (typeof issuedAtSeconds !== "number") return false;
  return issuedAtSeconds * 1000 + 1000 >= validFrom.getTime();
}

/** Constant-time hex compare, for anything that grows a second credential. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
