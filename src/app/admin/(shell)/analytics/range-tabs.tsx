import Link from "next/link";
import { RANGES } from "@/lib/admin/data/analytics";

/**
 * The date-range switcher shared by every analytics page.
 *
 * Links, not buttons: the range is part of the URL like every other piece of
 * table state, so a chart someone shares arrives at the same range.
 */
export function RangeTabs({ basePath, current }: { basePath: string; current: string }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
      {RANGES.map((range) => (
        <Link
          key={range.value}
          href={range.value === "30d" ? basePath : `${basePath}?range=${range.value}`}
          aria-current={range.value === current ? "true" : undefined}
          className={`px-2.5 py-1 text-[12px] font-medium transition ${
            range.value === current
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          {range.label}
        </Link>
      ))}
    </div>
  );
}
