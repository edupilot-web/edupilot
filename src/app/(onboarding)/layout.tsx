import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { VERIFY_EMAIL_PATH } from "@/lib/auth-routing";
import { logoutAction } from "@/lib/auth-actions";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Chrome for the onboarding steps: signed in, but not yet let into the app, so
 * there is no sidebar — just the mark, the step content, and a way out.
 *
 * It checks only the two things that are true of every screen underneath: there
 * is a user, and their address is confirmed. Whether the *profile* is finished
 * is left to the individual pages, because the answer means opposite things on
 * a step ("you are done, go to the dashboard") and on the completion screen
 * ("you are done, that is why you are here") — deciding it once up here is how
 * that page would bounce itself in a loop.
 */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.needsEmailVerification) redirect(VERIFY_EMAIL_PATH);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f9fc] dark:bg-slate-950">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <BrandLogo />
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-12 pt-2 sm:items-center sm:pt-0">
        <div className="w-full max-w-[520px]">{children}</div>
      </main>
    </div>
  );
}
