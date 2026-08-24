import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { AdminLoginForm } from "@/components/admin/login-form";
import { ShieldCheckIcon } from "@/components/admin/icons";
import { getCurrentAdmin } from "@/lib/admin/current-admin";

export const metadata: Metadata = {
  title: "Administrator sign in · EduPilot",
  robots: { index: false, follow: false },
};

/**
 * Administrator sign-in.
 *
 * Sits outside the `(shell)` route group, so the gate that protects every other
 * admin screen does not wrap the page you reach when the gate turns you away.
 *
 * Visually separate from the student sign-in on purpose: dark, plain, no
 * marketing panel. An operator should be able to tell at a glance which
 * application they are handing credentials to.
 */
export default async function AdminLoginPage(props: PageProps<"/admin/login">) {
  const { next } = await props.searchParams;

  // Already signed in — there is nothing to do here.
  if (await getCurrentAdmin()) redirect("/admin");

  const destination =
    typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//")
      ? next
      : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b1220] px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <BrandMark className="h-8 w-8" />
          <span className="text-[18px] font-semibold tracking-tight text-white">
            EduPilot
            <span className="ml-1.5 rounded bg-slate-700/70 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-slate-300">
              Admin
            </span>
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200/10 bg-white p-6 shadow-2xl dark:bg-slate-900">
          <h1 className="text-[19px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Administrator sign in
          </h1>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            This is a restricted application. Every action is recorded.
          </p>

          <div className="mt-5">
            <AdminLoginForm next={destination} />
          </div>
        </div>

        <p className="mt-5 flex items-start justify-center gap-1.5 text-center text-[11.5px] leading-relaxed text-slate-500">
          <ShieldCheckIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Sign-in attempts are logged with their origin. Accounts lock after repeated failures.
          </span>
        </p>
      </div>
    </div>
  );
}
