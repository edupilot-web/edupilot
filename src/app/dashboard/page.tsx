import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { LogOutIcon } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export const metadata: Metadata = { title: "Dashboard · EduPilot" };

const ROLE_STYLES: Record<string, string> = {
  student: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300",
  instructor: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  admin: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300",
};

/**
 * Where sign-in and sign-up land. Deliberately minimal — it exists so the auth
 * flow has a real, session-gated destination, not as the finished product UI.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard");

  await connectDB();
  const user = await User.findById(session.sub).lean();
  // The cookie outlived the account (deleted user, or a stale token).
  if (!user) redirect("/login");

  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <BrandLogo />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Welcome, {firstName}
        </h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-slate-400">
          You are signed in to EduPilot.
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[12px] font-medium uppercase tracking-wider text-slate-400">Name</dt>
            <dd className="mt-1 text-[15px] font-medium text-slate-900 dark:text-white">{user.name}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[12px] font-medium uppercase tracking-wider text-slate-400">Email</dt>
            <dd className="mt-1 text-[15px] font-medium text-slate-900 dark:text-white">{user.email}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[12px] font-medium uppercase tracking-wider text-slate-400">Role</dt>
            <dd className="mt-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold capitalize ring-1 ring-inset ${
                  ROLE_STYLES[user.role] ?? ROLE_STYLES.student
                }`}
              >
                {user.role}
              </span>
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[12px] font-medium uppercase tracking-wider text-slate-400">Member since</dt>
            <dd className="mt-1 text-[15px] font-medium text-slate-900 dark:text-white">
              {user.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>

        <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-5 text-[13.5px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
          This is a placeholder landing page so sign-in has somewhere to go. The course, lesson and
          enrollment APIs it will be built on are listed on the{" "}
          <Link href="/" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            home page
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
