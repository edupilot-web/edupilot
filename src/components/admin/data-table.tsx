import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { SelectAllCheckbox } from "@/components/admin/selection";
import { buildHref, PAGE_SIZES, pageCount, sortHref, type SearchParams, type SortSpec } from "@/lib/admin/query";
import { formatNumber } from "@/lib/admin/format";

/**
 * The table shell every list screen uses.
 *
 * A server component: the markup is generated once and shipped as HTML, with no
 * client-side sorting, filtering or pagination. At a million students the
 * browser was never going to hold the rows anyway, so the honest design is the
 * one that scales — the server does the work and the URL carries the state.
 *
 * Sorting is a link, not a handler. That means it works before hydration, the
 * middle-click and open-in-new-tab an operator expects both behave, and there
 * is no state to get out of step with what is on screen.
 */

export type Column = {
  key: string;
  label: string;
  /** Column key to sort by. Omit for a column that cannot be sorted. */
  sortKey?: string;
  /** Right-aligns numeric columns so digits line up. */
  numeric?: boolean;
  /** Hides the column below `lg`, for detail that does not fit a narrow screen. */
  secondary?: boolean;
  width?: string;
};

export function DataTable({
  columns,
  selectable = false,
  children,
  basePath,
  params,
  sort,
  /** Rendered in place of rows when there are none. */
  empty,
  rowCount,
}: {
  columns: Column[];
  selectable?: boolean;
  children: ReactNode;
  basePath: string;
  params: SearchParams;
  sort?: SortSpec;
  empty?: ReactNode;
  rowCount: number;
}) {
  if (rowCount === 0 && empty) {
    return <div className="border-t border-slate-100 dark:border-slate-800">{empty}</div>;
  }

  return (
    // The scroll container is the table's own, not the page's: a wide table
    // must scroll inside its card rather than making the whole layout slide.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          {/*
            Sticky at the top of the scroll container, so column headings stay
            readable while paging through 200 rows. `z-10` clears the row
            content but stays under the toolbar and any open dialog.
          */}
          <tr className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm dark:bg-slate-900/95">
            {selectable && (
              <th scope="col" className="w-9 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                <SelectAllCheckbox />
              </th>
            )}
            {columns.map((column) => {
              const sortable = Boolean(column.sortKey && sort);
              const active = sortable && sort!.field === column.sortKey;

              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={
                    active ? (sort!.direction === 1 ? "ascending" : "descending") : undefined
                  }
                  className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:border-slate-700 dark:text-slate-400 ${
                    column.numeric ? "text-right" : ""
                  } ${column.secondary ? "hidden lg:table-cell" : ""}`}
                >
                  {sortable ? (
                    <Link
                      href={sortHref(basePath, params, column.sortKey!, sort!)}
                      className={`inline-flex items-center gap-1 rounded transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:text-slate-200 ${
                        active ? "text-slate-800 dark:text-slate-100" : ""
                      }`}
                    >
                      {column.label}
                      <ChevronDownIcon
                        className={`h-3 w-3 transition ${
                          active
                            ? sort!.direction === 1
                              ? "rotate-180 opacity-100"
                              : "opacity-100"
                            : "opacity-0 group-hover:opacity-40"
                        }`}
                      />
                    </Link>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({
  children,
  highlighted,
}: {
  children: ReactNode;
  /** Draws attention to a row needing action, without relying on colour alone. */
  highlighted?: boolean;
}) {
  return (
    <tr
      className={`group transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
        highlighted ? "bg-amber-50/40 dark:bg-amber-500/5" : ""
      }`}
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  numeric,
  secondary,
  muted,
  nowrap,
}: {
  children: ReactNode;
  numeric?: boolean;
  secondary?: boolean;
  muted?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2.5 align-middle text-[13px] ${
        numeric ? "text-right tabular-nums" : ""
      } ${secondary ? "hidden lg:table-cell" : ""} ${
        muted ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-200"
      } ${nowrap ? "whitespace-nowrap" : ""}`}
    >
      {children}
    </td>
  );
}

/** The checkbox cell. Separate so the width matches the header exactly. */
export function SelectCell({ children }: { children: ReactNode }) {
  return <td className="w-9 px-3 py-2.5 align-middle">{children}</td>;
}

/**
 * A primary cell: the name, plus a quieter second line for the identifier or
 * location. Two lines rather than two columns keeps the table narrow enough to
 * read without horizontal scrolling on a laptop.
 */
export function PrimaryCell({
  href,
  title,
  subtitle,
  badge,
}: {
  href?: string;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <td className="max-w-[320px] px-3 py-2.5 align-middle">
      <div className="flex items-center gap-2">
        {href ? (
          <Link
            href={href}
            className="truncate rounded text-[13.5px] font-medium text-slate-900 transition hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-white dark:hover:text-blue-400"
          >
            {title}
          </Link>
        ) : (
          <span className="truncate text-[13.5px] font-medium text-slate-900 dark:text-white">
            {title}
          </span>
        )}
        {badge}
      </div>
      {subtitle && (
        <p className="mt-0.5 truncate text-[12px] text-slate-400 dark:text-slate-500">{subtitle}</p>
      )}
    </td>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────

/**
 * Footer showing the current window and offering movement through it.
 *
 * Deliberately not a numbered pager with every page listed: at 20,000 pages the
 * numbers are meaningless, and an operator who needs row 400,000 needs a better
 * filter rather than a longer pager.
 */
export function TableFooter({
  basePath,
  params,
  page,
  limit,
  total,
}: {
  basePath: string;
  params: SearchParams;
  page: number;
  limit: number;
  total: number;
}) {
  const pages = pageCount(total, limit);
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
        {total === 0 ? (
          "No results"
        ) : (
          <>
            <span className="font-medium text-slate-700 tabular-nums dark:text-slate-200">
              {formatNumber(first)}–{formatNumber(last)}
            </span>{" "}
            of <span className="tabular-nums">{formatNumber(total)}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline">Rows</span>
          {/*
            Links rather than a <select>: a select would need client JavaScript
            to navigate, and this whole table works without any.
          */}
          <span className="flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
            {PAGE_SIZES.map((size) => (
              <Link
                key={size}
                href={buildHref(basePath, params, { limit: size, page: null })}
                aria-current={size === limit ? "true" : undefined}
                className={`px-2 py-1 text-[12px] tabular-nums transition ${
                  size === limit
                    ? "bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {size}
              </Link>
            ))}
          </span>
        </label>

        <div className="flex items-center gap-1">
          <PageLink
            href={buildHref(basePath, params, { page: page - 1 })}
            disabled={page <= 1}
            label="Previous page"
          >
            Previous
          </PageLink>
          <span className="px-1.5 text-[12.5px] text-slate-500 tabular-nums dark:text-slate-400">
            {page} / {pages}
          </span>
          <PageLink
            href={buildHref(basePath, params, { page: page + 1 })}
            disabled={page >= pages}
            label="Next page"
          >
            Next
          </PageLink>
        </div>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const className =
    "rounded-md border border-slate-200 px-2 py-1 text-[12.5px] font-medium transition dark:border-slate-700";

  if (disabled) {
    return (
      <span aria-disabled="true" className={`${className} text-slate-300 dark:text-slate-600`}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`${className} text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-300 dark:hover:bg-slate-800`}
    >
      {children}
    </Link>
  );
}
