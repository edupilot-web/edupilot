import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand";

/**
 * Single-card chrome for the short auth screens that have no form to fill in —
 * "check your email", a verification result, "you're all set".
 *
 * Deliberately not `AuthShell`: that layout's marketing panel is there to sell
 * the product to someone deciding whether to sign up. These screens are read by
 * someone who already has, and who needs one instruction and one button.
 */
export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f9fc] dark:bg-slate-950">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <BrandLogo />
        <Link
          href="/"
          className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Home
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-12 pt-2 sm:items-center sm:pt-0">
        <div className="w-full max-w-[440px]">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
