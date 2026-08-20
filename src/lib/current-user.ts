import { cache } from "react";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import type { Role } from "@/models/User";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  city: string | null;
  avatarUrl: string | null;
  education: { college: string; program: string; currentYear: number } | null;
  /** Null until the onboarding education step is submitted. */
  onboardingCompletedAt: Date | null;
  /** True when the account has no password, i.e. it signs in with Google. */
  isGoogleAccount: boolean;
};

/**
 * The signed-in user, or null. Wrapped in React's `cache` so the shell layout
 * and the page inside it share one query per request instead of each making
 * their own.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  await connectDB();
  const user = await User.findById(session.sub)
    .select("name email role phone city avatarUrl education onboardingCompletedAt googleId")
    .lean();
  // The cookie outlived the account.
  if (!user) return null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    city: user.city ?? null,
    avatarUrl: user.avatarUrl ?? null,
    education: user.education
      ? {
          college: user.education.college,
          program: user.education.program,
          currentYear: user.education.currentYear,
        }
      : null,
    onboardingCompletedAt: user.onboardingCompletedAt ?? null,
    isGoogleAccount: Boolean(user.googleId),
  };
});
