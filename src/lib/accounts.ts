import bcrypt from "bcryptjs";
import type { HydratedDocument } from "mongoose";
import { connectDB } from "@/lib/db";
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

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) return { ok: false, reason: "invalid-credentials" };

  return { ok: true, user };
}
