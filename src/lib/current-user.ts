import { cache } from "react";
import { getSession } from "@/lib/auth";
import { sessionIsFresh } from "@/lib/password-reset";
import { connectDB } from "@/lib/db";
import { getStudentProfile, type StudentProfileView } from "@/lib/student-profile";
import { User, needsEmailVerification } from "@/models/User";
import type { AuthProvider, Role } from "@/models/User";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  authProvider: AuthProvider;
  emailVerified: boolean;
  phone: string | null;
  city: string | null;
  avatarUrl: string | null;
  /** Null until the first onboarding step is submitted. */
  profile: StudentProfileView | null;
  /** True when the account owes us a confirmed address before it can go on. */
  needsEmailVerification: boolean;
  /** True once every required onboarding field is filled in. */
  profileCompleted: boolean;
  /** True when the account can sign in with Google. */
  isGoogleAccount: boolean;
};

/**
 * The signed-in user, or null. Wrapped in React's `cache` so the shell layout
 * and the page inside it share one query per request instead of each making
 * their own.
 *
 * The student profile is read alongside the user because every gate in the app
 * needs both — "is this person verified, and have they finished onboarding" is
 * one question, and answering it in one place is what keeps the redirects from
 * disagreeing with each other and looping.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  await connectDB();
  const user = await User.findById(session.sub)
    .select("name email role authProvider emailVerified phone city avatarUrl googleId sessionsValidFrom")
    .lean();
  // The cookie outlived the account.
  if (!user) return null;

  /**
   * A session older than the account's revocation mark is not a session.
   *
   * Free here — the document is already loaded — and necessary, because a
   * password reset cannot delete a stateless JWT. Returning null rather than
   * throwing keeps every existing caller correct: they all already handle "no
   * user", and a reset should look exactly like being signed out.
   */
  if (!sessionIsFresh(session.issuedAt, user.sessionsValidFrom)) return null;

  const profile = await getStudentProfile(session.sub);

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    // `.lean()` skips schema defaults, so a row written before the field
    // existed comes back without one. Derive it the way the migration does
    // rather than shipping `undefined` under a non-optional type.
    authProvider: (user.authProvider as AuthProvider) ?? (user.googleId ? "google" : "email"),
    emailVerified: user.emailVerified === true,
    phone: user.phone ?? null,
    city: user.city ?? null,
    avatarUrl: user.avatarUrl ?? null,
    profile,
    needsEmailVerification: needsEmailVerification(user),
    profileCompleted: profile?.profileCompleted === true,
    isGoogleAccount: Boolean(user.googleId),
  };
});
