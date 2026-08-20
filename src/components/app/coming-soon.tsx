import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { navItem } from "@/components/app/nav";

/**
 * Stands in for a sidebar destination that has no screen yet. It names the
 * section and says what it will do, so a visitor is never left wondering
 * whether the click worked or the page is broken.
 */
export function ComingSoon({ href }: { href: string }) {
  const item = navItem(href);
  if (!item) {
    throw new Error(`ComingSoon: "${href}" is not in NAV_GROUPS — add it there first.`);
  }
  const Icon = item.icon;

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-400">
        <Link href="/dashboard" className="transition hover:text-slate-600 dark:hover:text-slate-300">
          Dashboard
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="text-slate-500 dark:text-slate-400">{item.label}</span>
      </nav>

      <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
          <Icon className="h-7 w-7" />
        </span>

        <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {item.label}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          {item.blurb}
        </p>

        <p className="mx-auto mt-5 inline-flex rounded-full bg-amber-50 px-3.5 py-1.5 text-[12.5px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Not built yet
        </p>

        <p className="mx-auto mt-5 max-w-md text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">
          This screen has no data model or API behind it yet. It exists so the navigation is complete
          and honest about what works.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
