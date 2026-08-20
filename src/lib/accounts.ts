import bcrypt from "bcryptjs";
import type { HydratedDocument } from "mongoose";
import { connectDB } from "@/lib/db";
import { User, type UserDoc, type Role, type Program } from "@/models/User";

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
 * Creates a user with a hashed password. Callers must have validated `input`
 * already (see registerSchema / signupFormSchema).
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
      role: input.role ?? "student",
    });
    return { ok: true, user };
  } catch (err) {
    // The unique index is the real guard: two simultaneous sign-ups can both
    // pass the findOne above, and only one of them can win the insert.
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      return { ok: false, reason: "email-taken" };
    }
    throw err;
  }
}

/**
 * Verifies an email/password pair. Returns the same `invalid-credentials`
 * reason whether the email is unknown or the password is wrong, so neither
 * caller can leak which emails have accounts.
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
 * same account rather than hitting the unique-email index. Linking on an
 * *unverified* Google email is deliberately not done — that would let anyone
 * who can create a Google address claim an existing EduPilot account.
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
      existingByEmail.emailVerified = true;
      existingByEmail.avatarUrl = existingByEmail.avatarUrl ?? profile.avatarUrl ?? null;
      await existingByEmail.save();
      return { user: existingByEmail, created: false };
    }
  }

  const user = await User.create({
    name: profile.name,
    email: profile.email,
    googleId: profile.googleId,
    emailVerified: profile.emailVerified,
    avatarUrl: profile.avatarUrl ?? null,
    role: "student",
  });
  return { user, created: true };
}

/** Saves onboarding step 1. */
export async function saveProfileDetails(
  userId: string,
  details: { name: string; phone: string | null; city: string | null }
): Promise<UserDocument | null> {
  await connectDB();
  return User.findByIdAndUpdate(
    userId,
    { name: details.name, phone: details.phone, city: details.city },
    { returnDocument: "after", runValidators: true }
  );
}

/**
 * Saves onboarding step 2 and marks onboarding done — the education step is the
 * last one, so completion is recorded here rather than tracked as its own flag.
 */
export async function saveEducationDetails(
  userId: string,
  education: { college: string; program: Program; currentYear: number }
): Promise<UserDocument | null> {
  await connectDB();
  return User.findByIdAndUpdate(
    userId,
    { education, onboardingCompletedAt: new Date() },
    { returnDocument: "after", runValidators: true }
  );
}
