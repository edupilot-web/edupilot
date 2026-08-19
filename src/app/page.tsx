import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export const metadata: Metadata = {
  title: "EduPilot — Learn. Connect. Grow.",
  description:
    "A one-stop platform for graduate students to discover opportunities, connect with peers and mentors, and accelerate your journey.",
};

/**
 * Reads the signed-in user for the header. The design shows the signed-in state
 * (avatar, name, notification bell); signed-out visitors get Sign in / Join Now
 * in place of that cluster.
 *
 * A missing database is not allowed to break the marketing page — the header
 * simply falls back to the signed-out state.
 */
async function headerUser(): Promise<HeaderUser | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    await connectDB();
    const user = await User.findById(session.sub).select("name").lean();
    if (!user) return null;
    // TODO: replace with a real unread count once notifications exist.
    return { name: user.name, notifications: 3 };
  } catch (err) {
    console.error("[landing] could not load the session user:", err);
    return null;
  }
}

export default async function LandingPage() {
  const user = await headerUser();

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-slate-950">
      <SiteHeader user={user} />
      <main className="flex-1">
        <Hero />
      </main>
    </div>
  );
}
