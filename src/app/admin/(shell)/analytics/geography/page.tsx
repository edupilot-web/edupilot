import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsTabs } from "@/app/admin/(shell)/analytics/page";
import { MapPinIcon } from "@/components/admin/icons";
import { Breadcrumbs, Card, EmptyState, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber, share } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { getGeographyBreakdown } from "@/lib/admin/data/analytics";

export const metadata: Metadata = { title: "Geographic analytics" };

const BASE = "/admin/analytics/geography";

/**
 * State → district → city drill-down (spec §25).
 *
 * A ranked, proportional table rather than a choropleth map. A map of India
 * needs boundary data the platform does not have, and with two states seeded it
 * would be a mostly-empty picture where a sorted list of real numbers is both
 * more useful and honest about what is known.
 */
export default async function GeographyAnalyticsPage(
  props: PageProps<"/admin/analytics/geography">
) {
  await requirePermission("analytics.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const breakdown = await getGeographyBreakdown(params);

  const crumbs = [
    { label: "All states", href: BASE },
    ...(breakdown.state
      ? [
          {
            label: breakdown.state,
            href: `${BASE}?state=${encodeURIComponent(breakdown.state)}`,
          },
        ]
      : []),
    ...(breakdown.district ? [{ label: breakdown.district }] : []),
  ];

  const heading =
    breakdown.level === "state"
      ? "States"
      : breakdown.level === "district"
        ? `Districts of ${breakdown.state}`
        : `Cities in ${breakdown.district}`;

  const maxStudents = Math.max(...breakdown.nodes.map((node) => node.students), 1);

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Geographic analytics"
        description="Colleges and students by location. Click through to drill down."
        breadcrumbs={[{ label: "Analytics" }, { label: "Geography" }]}
      />

      <AnalyticsTabs current={BASE} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Colleges here" value={breakdown.totals.colleges} delta={null} />
        <StatCard label="Students here" value={breakdown.totals.students} delta={null} />
        <StatCard
          label="Locations"
          value={breakdown.nodes.length}
          delta={null}
          hint={
            breakdown.level === "state"
              ? "States with colleges"
              : breakdown.level === "district"
                ? "Districts with colleges"
                : "Cities with colleges"
          }
        />
      </div>

      <div className="mt-4">
        <Card title={heading} padded={false}>
          <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
            <Breadcrumbs items={crumbs} />
          </div>

          {breakdown.nodes.length === 0 ? (
            <EmptyState
              icon={<MapPinIcon className="h-5 w-5" />}
              title="Nothing recorded here"
              description="No colleges are assigned to this location yet."
              suggestions={[
                "Colleges without a district do not appear at this level",
                "Check Data Quality for records missing a location",
              ]}
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {breakdown.nodes.map((node) => (
                <li key={node.label}>
                  <Link
                    href={node.href}
                    className="block px-4 py-2.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13.5px] font-medium text-slate-800 dark:text-slate-100">
                        {node.label}
                      </span>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-slate-500 dark:text-slate-400">
                        {formatNumber(node.colleges)} colleges ·{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {formatNumber(node.students)}
                        </span>{" "}
                        students
                        <span className="ml-1.5 text-slate-300 dark:text-slate-600">
                          {share(node.students, breakdown.totals.students).toFixed(1)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-600/80"
                        style={{ width: `${Math.max(2, (node.students / maxStudents) * 100)}%` }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <InfoNote>
          A ranked table rather than a map: boundary data for India is not in the platform, and with
          two states seeded a choropleth would be a mostly-empty picture where a sorted list of real
          numbers says more. Student counts come from each college&apos;s maintained counter, which a
          background job recomputes — see System → Background Jobs.
        </InfoNote>
      </div>
    </div>
  );
}
