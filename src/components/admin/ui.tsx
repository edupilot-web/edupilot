import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { InfoIcon, TrendDownIcon, TrendUpIcon } from "@/components/admin/icons";

/**
 * The admin design system: badges, cards, headers, empty and error states.
 *
 * Server components with no client JavaScript — everything here is presentation
 * that renders once. The interactive pieces (tables, dialogs, the palette) are
 * separate client components, so a page of static chrome does not ship a
 * bundle to hydrate it.
 *
 * The visual language is deliberately quieter than the student app: neutral
 * greys, one accent, hairline borders, dense type. An operator reads this
 * screen for six hours a day and needs the *data* to be the loudest thing on it.
 */

// ── Status badges ──────────────────────────────────────────────────────────

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  warning:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  danger:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  info: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  purple:
    "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
};

/** Shapes drawn next to the label, so status is never carried by colour alone. */
const TONE_GLYPHS: Record<BadgeTone, string> = {
  neutral: "M4 4h4v4H4z",
  success: "M2 6l2.5 2.5L10 3",
  warning: "M6 2.5v4M6 8.6v.4",
  danger: "M3 3l6 6M9 3l-6 6",
  info: "M6 5v4M6 3v.4",
  purple: "M6 2l4 4-4 4-4-4z",
};

/**
 * A status pill.
 *
 * Every badge carries a small glyph as well as its colour. Roughly one in
 * twelve men cannot reliably separate the green and amber used for "Verified"
 * and "Pending", and this table is read by people making decisions from exactly
 * that distinction (spec §39).
 */
export function Badge({
  tone = "neutral",
  children,
  glyph = true,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  glyph?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {glyph && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <path
            d={TONE_GLYPHS[tone]}
            fill={tone === "neutral" || tone === "purple" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {children}
    </span>
  );
}

// ── Page furniture ─────────────────────────────────────────────────────────

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[12.5px] text-slate-400 dark:text-slate-500">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:text-slate-200"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "font-medium text-slate-600 dark:text-slate-300" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && <ChevronRightIcon className="h-3 w-3 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Buttons, right-aligned on desktop and wrapped underneath on mobile. */
  actions?: ReactNode;
  /** Badges or counts shown next to the title. */
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-2">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[21px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  padded = true,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Off when the card holds a table, which supplies its own edge padding. */
  padded?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

// ── KPI ────────────────────────────────────────────────────────────────────

/**
 * The tint and ink each tone lends a `StatTile` glyph.
 *
 * Deliberately the same six tones as `BADGE_TONES`, so a status that is violet
 * on a badge in the table is violet on the tile above it. The ink is the 600
 * step rather than the 500: at 500 both amber and emerald fall under 3:1 against
 * white, which is the floor for a graphical mark.
 */
const TILE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  danger: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  info: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  purple: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
};

/**
 * A census tile: a glyph, a label, a count and its share of the whole.
 *
 * Distinct from `StatCard`, which answers "how is this moving" with a delta
 * against a previous period. This one answers "how much of the whole is this",
 * which needs no time axis — so it is a tile and not a chart.
 *
 * The colour sits on the glyph only. The count and the label wear ordinary ink,
 * because colour here is a second copy of what the label already says: tinting
 * the number as well would leave a reader who cannot separate rose from emerald
 * with nothing, and would make the figure harder to read for everyone else.
 */
export function StatTile({
  label,
  value,
  share,
  tone = "neutral",
  icon: Icon,
  href,
  active = false,
}: {
  label: string;
  value: number;
  /** Share of the total, already computed. Omitted on the total itself. */
  share?: string;
  tone?: BadgeTone;
  icon: (props: { className?: string }) => ReactNode;
  /** Makes the tile the way into this slice of the directory. */
  href?: string;
  /** This slice is the one currently filtered to. */
  active?: boolean;
}) {
  const body = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TILE_TONES[tone]}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[21px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums dark:text-white">
            {value.toLocaleString("en-IN")}
          </span>
          {share && (
            <span className="text-[12px] leading-none text-slate-400 tabular-nums dark:text-slate-500">
              {share}
            </span>
          )}
        </span>
      </span>
    </>
  );

  const shell = `flex items-center gap-3 rounded-xl border bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 ${
    active
      ? "border-blue-300 ring-1 ring-blue-300 dark:border-blue-500/50 dark:ring-blue-500/40"
      : "border-slate-200/80 dark:border-slate-800"
  }`;

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`${shell} transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:border-slate-700`}
    >
      {body}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  /** Percentage change against the previous period. Omit when there is no basis. */
  delta?: number | null;
  deltaLabel?: string;
  /** Replaces the delta with a plain note — "Needs attention". */
  hint?: string;
  tone?: BadgeTone;
  href?: string;
}) {
  const rising = typeof delta === "number" && delta > 0;
  const falling = typeof delta === "number" && delta < 0;

  const body = (
    <>
      <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums dark:text-white">
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-[12px]">
        {typeof delta === "number" ? (
          <>
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                rising
                  ? "text-emerald-600 dark:text-emerald-400"
                  : falling
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-400"
              }`}
            >
              {rising ? (
                <TrendUpIcon className="h-3.5 w-3.5" />
              ) : falling ? (
                <TrendDownIcon className="h-3.5 w-3.5" />
              ) : null}
              {/* The sign is explicit: "12.4%" next to a down arrow is ambiguous. */}
              {rising ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
            <span className="text-slate-400 dark:text-slate-500">
              {deltaLabel ?? "vs last period"}
            </span>
          </>
        ) : hint ? (
          <span className={tone === "warning" ? "font-medium text-amber-700 dark:text-amber-400" : "text-slate-400"}>
            {hint}
          </span>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">No prior period</span>
        )}
      </div>
    </>
  );

  const shell =
    "rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900";

  if (href) {
    return (
      <Link
        href={href}
        className={`${shell} block transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:border-slate-700`}
      >
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

// ── Empty, error and loading states ────────────────────────────────────────

/**
 * An empty table is ambiguous: no data, or a filter that excludes everything?
 * `suggestions` is what turns it into something actionable (spec §44).
 */
export function EmptyState({
  title,
  description,
  suggestions,
  action,
  icon,
}: {
  title: string;
  description?: string;
  suggestions?: string[];
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          {icon}
        </span>
      )}
      <p className="text-[14.5px] font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {suggestions && suggestions.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12.5px] text-slate-400 dark:text-slate-500">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>· {suggestion}</li>
          ))}
        </ul>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 dark:border-rose-500/30 dark:bg-rose-500/10"
    >
      <svg viewBox="0 0 24 24" className="mt-px h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
      <div>
        <p className="text-[13px] font-semibold text-rose-800 dark:text-rose-200">{title}</p>
        {detail && <p className="mt-0.5 text-[12.5px] text-rose-700 dark:text-rose-300">{detail}</p>}
      </div>
    </div>
  );
}

const NOTE_TONES = {
  neutral:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
} as const;

export function InfoNote({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  /** `warning` for a condition an operator has to act on, not merely read. */
  tone?: keyof typeof NOTE_TONES;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed ${NOTE_TONES[tone]}`}
    >
      <InfoIcon
        className={`mt-px h-4 w-4 shrink-0 ${tone === "warning" ? "text-amber-500" : "text-slate-400"}`}
      />
      <div>{children}</div>
    </div>
  );
}

/** Grey blocks matching the row height of what is loading. */
export function SkeletonRows({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div
              key={columnIndex}
              className="h-3 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
              style={{ width: columnIndex === 0 ? "28%" : `${12 + ((columnIndex * 7) % 10)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Buttons and links ──────────────────────────────────────────────────────

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-55";

export const BUTTON_STYLES = {
  primary: `${BUTTON_BASE} bg-slate-900 px-3 py-[7px] text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100`,
  secondary: `${BUTTON_BASE} border border-slate-200 bg-white px-3 py-[7px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`,
  danger: `${BUTTON_BASE} border border-rose-200 bg-white px-3 py-[7px] text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10`,
  ghost: `${BUTTON_BASE} px-2.5 py-[7px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100`,
} as const;

export function ButtonLink({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: keyof typeof BUTTON_STYLES;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={BUTTON_STYLES[variant]}>
      {children}
    </Link>
  );
}

// ── Description list, for detail pages ─────────────────────────────────────

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
  );
}

/**
 * One labelled value. An absent value renders as a dash rather than an empty
 * cell — "not recorded" and "we forgot to render it" must look different.
 */
export function Field({
  label,
  value,
  href,
  span,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  span?: boolean;
}) {
  const empty =
    value === null || value === undefined || value === "" || value === false;

  return (
    <div className={span ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13.5px] text-slate-800 dark:text-slate-100">
        {empty ? (
          <span className="text-slate-300 dark:text-slate-600">—</span>
        ) : href ? (
          <Link
            href={href}
            className="rounded font-medium text-blue-600 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-400"
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
