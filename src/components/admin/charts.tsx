import type { ReactNode } from "react";
import { formatCompact, formatNumber, share } from "@/lib/admin/format";

/**
 * Charts as inline SVG, rendered on the server.
 *
 * No charting library. These are four fixed shapes over data the server already
 * has, and a runtime chart library would add ~50KB to every dashboard load to
 * redraw in the browser what the server can emit as markup. Server SVG also
 * means the dashboard renders identically before hydration and prints.
 *
 * The palette is one accent plus greys. A dashboard where every series is a
 * different bright colour is a dashboard where nothing stands out.
 */

/** Series colours, in the order they are handed out. */
const SERIES = [
  "#2563eb",
  "#0ea5e9",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#64748b",
  "#0f766e",
];

export type Point = { label: string; value: number };

// ── Line ───────────────────────────────────────────────────────────────────

/**
 * A growth line with an area fill.
 *
 * The Y axis always starts at zero. Truncating it makes a 2% rise look like a
 * cliff, which is exactly the kind of chart that gets screenshotted into a
 * board deck and believed.
 */
export function LineChart({
  points,
  height = 180,
  valueLabel = "value",
}: {
  points: Point[];
  height?: number;
  valueLabel?: string;
}) {
  if (points.length < 2) {
    return <ChartEmpty height={height} message="Not enough data to plot a trend yet." />;
  }

  const width = 720;
  const padding = { top: 12, right: 8, bottom: 22, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(...points.map((point) => point.value), 1);
  // Round the ceiling up to something a person would choose, so the gridline
  // labels read 0 / 250 / 500 rather than 0 / 237 / 474.
  const ceiling = niceCeiling(max);

  const x = (index: number) => padding.left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => padding.top + plotHeight - (value / ceiling) * plotHeight;

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${padding.top + plotHeight} L${x(0)},${padding.top + plotHeight} Z`;

  const gridValues = [0, ceiling / 2, ceiling];
  // At most eight X labels; more overlap illegibly at this width.
  const labelStep = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${valueLabel} from ${points[0].label} to ${points[points.length - 1].label}, peaking at ${formatNumber(max)}`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              stroke="currentColor"
              strokeWidth="1"
              className="text-slate-100 dark:text-slate-800"
            />
            <text
              x={padding.left - 8}
              y={y(value) + 3.5}
              textAnchor="end"
              className="fill-slate-400 text-[10px]"
            >
              {formatCompact(value)}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id="line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity="0.16" />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#line-fill)" />
        <path d={line} fill="none" stroke={SERIES[0]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point, index) =>
          index % labelStep === 0 || index === points.length - 1 ? (
            <text
              key={point.label}
              x={x(index)}
              y={height - 6}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              className="fill-slate-400 text-[10px]"
            >
              {point.label}
            </text>
          ) : null
        )}
      </svg>
    </figure>
  );
}

// ── Horizontal bars ────────────────────────────────────────────────────────

/**
 * A ranked breakdown. Horizontal because the labels are institution names,
 * which do not fit under a vertical bar without rotating them 45°.
 */
export function BarList({
  points,
  total,
  href,
  emptyMessage = "No data in this period.",
}: {
  points: Point[];
  /** Denominator for the percentages. Defaults to the sum of the points. */
  total?: number;
  /** Builds a drill-down link per row. */
  href?: (point: Point) => string;
  emptyMessage?: string;
}) {
  if (points.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-slate-400">{emptyMessage}</p>;
  }

  const denominator = total ?? points.reduce((sum, point) => sum + point.value, 0);
  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <ul className="space-y-2">
      {points.map((point, index) => {
        const percent = share(point.value, denominator);
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] text-slate-700 dark:text-slate-200">
                {point.label}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                {formatNumber(point.value)}
                <span className="ml-1.5 text-slate-300 dark:text-slate-600">
                  {percent.toFixed(1)}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (point.value / max) * 100)}%`,
                  backgroundColor: SERIES[index % SERIES.length],
                }}
              />
            </div>
          </>
        );

        return (
          <li key={point.label}>
            {href ? (
              <a
                href={href(point)}
                className="block rounded-md px-1 py-0.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-slate-800/50"
              >
                {row}
              </a>
            ) : (
              <div className="px-1 py-0.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Donut ──────────────────────────────────────────────────────────────────

/** A composition, with the legend carrying the numbers rather than the arcs. */
export function DonutChart({ points, centreLabel }: { points: Point[]; centreLabel?: string }) {
  const total = points.reduce((sum, point) => sum + point.value, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-[12.5px] text-slate-400">No data yet.</p>;
  }

  const radius = 52;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;

  /**
   * Arc lengths and their running offsets, computed before the JSX rather than
   * accumulated inside `.map()`. A variable mutated while rendering is a
   * variable that reads differently on a re-render.
   */
  const arcs: { dash: number; offset: number }[] = [];
  let running = 0;
  for (const point of points) {
    const dash = (point.value / total) * circumference;
    arcs.push({ dash, offset: running });
    running += dash;
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        viewBox="0 0 140 140"
        className="h-[140px] w-[140px] shrink-0 -rotate-90"
        role="img"
        aria-label={points.map((point) => `${point.label}: ${point.value}`).join(", ")}
      >
        {points.map((point, index) => (
          <circle
            key={point.label}
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={SERIES[index % SERIES.length]}
            strokeWidth={stroke}
            strokeDasharray={`${arcs[index].dash} ${circumference - arcs[index].dash}`}
            strokeDashoffset={-arcs[index].offset}
          />
        ))}
      </svg>

      <ul className="min-w-[160px] flex-1 space-y-1.5">
        {centreLabel && (
          <li className="pb-1 text-[12px] font-medium text-slate-400">{centreLabel}</li>
        )}
        {points.map((point, index) => (
          <li key={point.label} className="flex items-center gap-2 text-[12.5px]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: SERIES[index % SERIES.length] }}
            />
            <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{point.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
              {formatNumber(point.value)}
            </span>
            <span className="w-11 shrink-0 text-right tabular-nums text-slate-300 dark:text-slate-600">
              {share(point.value, total).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Funnel ─────────────────────────────────────────────────────────────────

export type FunnelStep = { label: string; value: number; href?: string };

/**
 * The registration funnel (spec §3).
 *
 * Each step shows conversion from the *previous* step as well as from the top.
 * Only the step-to-step figure tells you where people are dropping out, which
 * is the entire reason to draw a funnel.
 */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0) return null;
  const top = steps[0].value || 1;

  return (
    <ol className="space-y-1.5">
      {steps.map((step, index) => {
        const previous = index === 0 ? null : steps[index - 1].value;
        const fromTop = share(step.value, top);
        const fromPrevious = previous === null ? null : share(step.value, previous || 1);
        const dropped = previous === null ? 0 : previous - step.value;

        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
                {step.label}
              </span>
              <span className="text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                {formatNumber(step.value)}
                <span className="ml-1.5 text-slate-300 dark:text-slate-600">
                  {fromTop.toFixed(1)}%
                </span>
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                <div
                  className="flex h-full items-center rounded bg-blue-600/85 px-2"
                  style={{ width: `${Math.max(3, fromTop)}%` }}
                />
              </div>
              {fromPrevious !== null && (
                <span
                  className={`w-[132px] shrink-0 text-right text-[11.5px] tabular-nums ${
                    fromPrevious < 60 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
                  }`}
                  title={`${formatNumber(dropped)} did not continue from the previous step`}
                >
                  {fromPrevious.toFixed(1)}% of previous
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Shared ─────────────────────────────────────────────────────────────────

function ChartEmpty({ height, message }: { height: number; message: string }) {
  return (
    <div
      style={{ height }}
      className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12.5px] text-slate-400 dark:border-slate-700"
    >
      {message}
    </div>
  );
}

/** Rounds up to 1, 2, 2.5 or 5 × a power of ten, so axis labels are readable. */
function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Wrapper giving a chart a heading and an optional period switcher. */
export function ChartFrame({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
