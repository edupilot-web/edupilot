import type { Metadata } from "next";
import { LandingBody, SiteFooter, isAudience, type Audience } from "@/components/landing-sections";
import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { unreadCount } from "@/lib/notifications/service";

export const metadata: Metadata = {
  title: "EduPilot — your syllabus, explained",
  description:
    "Your college's own syllabus laid out by semester, an AI tutor that answers from it, and the assignments and notes your teachers send — in one place.",
};

/**
 * Reads the signed-in user for the header.
 *
 * The unread count is **real**. It used to be a hard-coded `3` behind a TODO,
 * which showed every signed-in visitor a badge for three things they did not
 * have and did nothing when pressed.
 *
 * A database that cannot be reached must not break the marketing page, so any
 * failure falls back to the signed-out header rather than throwing. Somebody
 * evaluating the product should not meet a stack trace.
 */
async function headerUser(): Promise<HeaderUser | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    await connectDB();
    const user = await User.findById(session.sub).select("name").lean();
    if (!user) return null;

    return { name: user.name, notifications: await unreadCount(session.sub) };
  } catch (err) {
    console.error("[landing] could not load the session user:", err);
    return null;
  }
}

/**
 * The landing page.
 *
 * Shows **one audience at a time**, students by default. Stacking both meant a
 * teacher scrolled past six student features before reaching anything addressed
 * to them, and a student scrolled past a teacher section to reach the end.
 *
 * The audience comes from `?for=`, not from client state: the teacher view is
 * then server-rendered rather than appearing after hydration, it is shareable,
 * and there is no flash of the wrong audience on first paint.
 *
 * Every section describes something that is built, and every link resolves.
 */
export default async function LandingPage(props: PageProps<"/">) {
  const params = await props.searchParams;
  const requested = typeof params.for === "string" ? params.for : null;
  const audience: Audience = isAudience(requested) ? requested : "students";

  const user = await headerUser();

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-slate-950">
      <SiteHeader user={user} audience={audience} />
      <main className="flex-1">
        <LandingBody audience={audience} signedIn={user !== null} />
      </main>
      <SiteFooter />
    </div>
  );
}
