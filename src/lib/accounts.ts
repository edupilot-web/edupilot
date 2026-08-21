import bcrypt from "bcryptjs";
import type { HydratedDocument } from "mongoose";
import { connectDB } from "@/lib/db";
import { EmailVerificationToken } from "@/models/EmailVerificationToken";
import { User, type UserDoc, type Role } from "@/models/User";

const BCRYPT_ROUNDS = 12;

export type UserDocument = HydratedDocument<UserDoc>;

/**
 * Outcome of a sign-up or sign-in attempt. `reason` is a code rather than a
 * message so each caller can phrase it for its own audience — the API returns
 * a JSON error, the sign-in form renders it next to the submit button.
 */
export type AccountResult =
  | { ok: true; user: UserDocument }
  | { ok: false; reason: "email-taken" | "invalid-credentials" };

/**
 * Creates a password account. Callers must have validated `input` already
 * (see registerSchema / signupFormSchema).
 *
 * The address starts unverified: proving it belongs to the person signing up
 * is the job of the link mailed straight after this returns. An account that
 * exists with `emailVerified: false` is a legitimate resting state, not a
 * half-finished write — which is what lets a failed send be recovered with
 * "resend" instead of a second sign-up.
 */
export async function createAccount(input: {
  name: string;
  email: string;
  password: string;
  role?: Role;
}): Promise<AccountResult> {
  await connectDB();

  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) return { ok: false, reason: "email-taken" };

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      authProvider: "email",
      emailVerified: false,
      role: input.role ?? "student",
    });
    return { ok: true, user };
  } catch (err) {
    // The unique index is the real guard: two simultaneous sign-ups can both
    // pass the findOne above, and only one of them can win the insert.
    if (isDuplicateKey(err)) return { ok: false, reason: "email-taken" };
    throw err;
  }
}

/**
 * Verifies an email/password pair. Returns the same `invalid-credentials`
 * reason whether the email is unknown or the password is wrong, so neither
 * caller can leak which emails have accounts.
 *
 * An unverified address is *not* a reason to refuse. Signing in is how the
 * user reaches the screen that resends the link; blocking it here would leave
 * anyone whose first email went astray with no way back in.
 */
export async function authenticate(input: {
  email: string;
  password: string;
}): Promise<AccountResult> {
  await connectDB();

  const user = await User.findOne({ email: input.email }).select("+passwordHash");
  if (!user) return { ok: false, reason: "invalid-credentials" };

  // A Google-only account has no hash to compare against. Same generic reason,
  // so the response cannot be used to discover which accounts use Google.
  if (!user.passwordHash) return { ok: false, reason: "invalid-credentials" };

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) return { ok: false, reason: "invalid-credentials" };

  return { ok: true, user };
}

/**
 * Resolves the Google identity to an account, creating one on first sign-in.
 *
 * Matching is by `googleId` first, then by verified email so that someone who
 * signed up with a password and later uses "Continue with Google" lands on the
 * same account rather than hitting the unique-email index — one person, one
 * user row, and therefore one student profile. Linking on an *unverified*
 * Google email is deliberately not done: that would let anyone who can create
 * a Google address claim an existing EduPilot account.
 */
export async function findOrCreateGoogleUser(profile: {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string | null;
}): Promise<{ user: UserDocument; created: boolean }> {
  await connectDB();

  const existingByGoogleId = await User.findOne({ googleId: profile.googleId });
  if (existingByGoogleId) {
    // Keep the display fields fresh, but never overwrite a name the user edited
    // during onboarding with the one Google holds.
    if (profile.avatarUrl && existingByGoogleId.avatarUrl !== profile.avatarUrl) {
      existingByGoogleId.avatarUrl = profile.avatarUrl;
      await existingByGoogleId.save();
    }
    return { user: existingByGoogleId, created: false };
  }

  if (profile.emailVerified) {
    const existingByEmail = await User.findOne({ email: profile.email });
    if (existingByEmail) {
      existingByEmail.googleId = profile.googleId;
      existingByEmail.avatarUrl = existingByEmail.avatarUrl ?? profile.avatarUrl ?? null;
      // Google has just vouched for an address this account was still being
      // asked to confirm, so any outstanding link is now moot.
      if (!existingByEmail.emailVerified) {
        existingByEmail.emailVerified = true;
        await EmailVerificationToken.deleteMany({ userId: existingByEmail._id });
      }
      // `authProvider` stays as it was. The password still works, and calling
      // this a Google account would hide that from the profile screen.
      await existingByEmail.save();
      return { user: existingByEmail, created: false };
    }
  }

  const user = await User.create({
    name: profile.name,
    email: profile.email,
    googleId: profile.googleId,
    authProvider: "google",
    // Google's own `email_verified` claim, not an assumption. A Workspace
    // account with an unconfirmed alias comes through as false.
    emailVerified: profile.emailVerified,
    avatarUrl: profile.avatarUrl ?? null,
    role: "student",
  });
  return { user, created: true };
}

export type ChangeEmailResult =
  | { ok: true; user: UserDocument }
  | { ok: false; reason: "email-taken" | "not-allowed" | "not-found" };

/**
 * Corrects the address on an account that has not been verified yet — the
 * "wrong email?" escape hatch on the check-your-inbox screen.
 *
 * Only ever available while `emailVerified` is false, so it cannot be used to
 * move a live account onto an attacker's address. Outstanding tokens are
 * dropped: they were minted for the old address and must not verify the new one.
 */
export async function changeUnverifiedEmail(
  userId: string,
  email: string
): Promise<ChangeEmailResult> {
  await connectDB();

  const user = await User.findById(userId);
  if (!user) return { ok: false, reason: "not-found" };
  if (user.emailVerified) return { ok: false, reason: "not-allowed" };
  if (user.email === email) return { ok: true, user };

  const taken = await User.findOne({ email }).select("_id").lean();
  if (taken) return { ok: false, reason: "email-taken" };

  user.email = email;
  try {
    await user.save();
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: false, reason: "email-taken" };
    throw err;
  }

  await EmailVerificationToken.deleteMany({ userId: user._id });
  return { ok: true, user };
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
