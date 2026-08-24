import Link from "next/link";
import type { ReactNode } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { FilterIcon } from "@/components/admin/icons";
import {
  buildHref,
  clearFiltersHref,
  readList,
  readParam,
  toggleValueHref,
  type SearchParams,
} from "@/lib/admin/query";

/**
 * The strip above a table: search, filter chips, saved views.
 *
 * Server-rendered and link-driven, like the table itself. Filters are anchors
 * that change the querystring; the search box is a plain GET form. No client
 * state means no gap between what the chips show and what the rows are.
 */

export type FilterOption = { value: string; label: string; count?: number };

export type FilterGroup = {
  key: string;
  label: string;
  options: FilterOption[];
  /** Renders as a single-choice row instead of toggles. */
  single?: boolean;
};

export function TableToolbar({
  basePath,
  params,
  searchPlaceholder,
  filters,
  filterKeys,
  children,
  savedViews,
}: {
  basePath: string;
  params: SearchParams;
  searchPlaceholder: string;
  filters?: FilterGroup[];
  /** Every key "Clear filters" should drop. */
  filterKeys: readonly string[];
  /** Actions on the right — export, add, bulk. */
  children?: ReactNode;
  savedViews?: ReactNode;
}) {
  const query = readParam(params, "q") ?? "";
  const active = filterKeys.flatMap((key) =>
    readList(params, key).map((value) => ({ key, value }))
  );

  return (
    <div className="border-b border-slate-100 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        {/*
          A GET form, so submitting produces a shareable URL rather than a POST
          with the query trapped in the request body.
        */}
        <form action={basePath} method="get" className="relative min-w-[220px] flex-1">
          {/* Filters and sort must survive a search; they ride along as hidden fields. */}
          {Object.entries(params).map(([key, value]) => {
            if (key === "q" || key === "page" || value === undefined) return null;
            const entries = Array.isArray(value) ? value : [value];
            return entries.map((entry, index) => (
              <input key={`${key}-${index}`} type="hidden" name={key} value={entry} />
            ));
          })}
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </form>

        {savedViews}

        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>

      {filters && filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-400 dark:text-slate-500">
            <FilterIcon className="h-3.5 w-3.5" />
            Filter
          </span>

          {filters.map((group) => (
            <FilterChips key={group.key} basePath={basePath} params={params} group={group} />
          ))}

          {(active.length > 0 || query) && (
            <Link
              href={clearFiltersHref(basePath, params, filterKeys)}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <CloseIcon className="h-3 w-3" />
              Clear{active.length > 0 ? ` (${active.length})` : ""}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChips({
  basePath,
  params,
  group,
}: {
  basePath: string;
  params: SearchParams;
  group: FilterGroup;
}) {
  const selected = readList(params, group.key);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[12px] text-slate-400 dark:text-slate-500">{group.label}</span>
      {group.options.map((option) => {
        const on = selected.includes(option.value);
        const href = group.single
          ? buildHref(basePath, params, { [group.key]: on ? null : option.value })
          : toggleValueHref(basePath, params, group.key, option.value);

        return (
          <Link
            key={option.value}
            href={href}
            aria-pressed={on}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
              on
                ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            {option.label}
            {typeof option.count === "number" && (
              <span className={`tabular-nums ${on ? "opacity-70" : "text-slate-400"}`}>
                {option.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Saved views (spec §33).
 *
 * Each is a stored querystring, so applying one is a link. That is the whole
 * feature: because table state lives in the URL, "save this view" is "save this
 * URL", and it needs no special handling anywhere else.
 */
export function SavedViewBar({
  basePath,
  views,
  currentQuery,
  children,
}: {
  basePath: string;
  views: { id: string; name: string; query: string; system: boolean }[];
  /** The current querystring, for marking the active view. */
  currentQuery: string;
  /** The "Save current view" control. */
  children?: ReactNode;
}) {
  if (views.length === 0 && !children) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((view) => {
        const active = view.query === currentQuery;
        return (
          <Link
            key={view.id}
            href={view.query ? `${basePath}?${view.query}` : basePath}
            aria-current={active ? "true" : undefined}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
              active
                ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            {view.name}
          </Link>
        );
      })}
      {children}
    </div>
  );
}
