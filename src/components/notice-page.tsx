import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand";
import { ChevronLeftIcon } from "@/components/icons";

/** Small centred card used by the pages the auth screens link out to. */
export function NoticePage({
  title,
  children,
  backHref = "/login",
  backLabel = "Back to login",
}: {
  title: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 dark:bg-slate-950">
      <div className="w-full max-w-[460px]">
        <BrandLogo />
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">
            {children}
          </div>
          <Link
            href={backHref}
            className="mt-6 inline-flex items-center gap-1 text-[13.5px] font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
