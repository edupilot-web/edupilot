import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsTabs } from "@/app/admin/(shell)/analytics/page";
import { BarList, ChartFrame, DonutChart } from "@/components/admin/charts";
import { Card, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import {
  AUTONOMY_STATUS_LABELS,
  VERIFICATION_STATUS_LABELS,
  type AutonomyStatus,
  type VerificationStatus,
} from "@/lib/admin/institution-fields";
import { getInstitutionAnalytics } from "@/lib/admin/data/analytics";

export const metadata: Metadata = { title: "Institution analytics" };

const BASE = "/admin/analytics/institutions";

export default async function InstitutionAnalyticsPage() {
  await requirePermission("analytics.view", BASE);
  const data = await getInstitutionAnalytics();

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Institution analytics"
        description="How the college directory is composed, and where the students are concentrated."
        breadcrumbs={[{ label: "Analytics" }, { label: "Institutions" }]}
      />

      <AnalyticsTabs current={BASE} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <ChartFrame title="By institution type" subtitle="Active colleges">
            <DonutChart points={data.byType} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="By management" subtitle="Who runs them">
            <DonutChart points={data.byManagement} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Autonomous vs affiliated" subtitle="Current status">
            <DonutChart
              points={data.byAutonomy.map((entry) => ({
                label: AUTONOMY_STATUS_LABELS[entry.label as AutonomyStatus] ?? entry.label,
                value: entry.value,
              }))}
            />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <ChartFrame
            title="Verification state"
            subtitle="How much of the directory has been attested"
          >
            <BarList
              points={data.byVerification.map((entry) => ({
                label: VERIFICATION_STATUS_LABELS[entry.label as VerificationStatus] ?? entry.label,
                value: entry.value,
              }))}
            />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Where records came from" subtitle="Provenance of the directory">
            <BarList
              points={data.bySource}
              href={(point) => `/admin/colleges?source=${encodeURIComponent(point.label)}`}
            />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Universities by colleges affiliated" padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.topUniversities.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <Link
                  href={`/admin/universities/${entry.id}`}
                  className="min-w-0 flex-1 truncate text-[13px] text-slate-800 hover:underline dark:text-slate-100"
                >
                  {entry.label}
                </Link>
                <span className="shrink-0 text-[12.5px] tabular-nums text-slate-500">
                  {formatNumber(entry.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Colleges by student count" padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.topColleges.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/admin/colleges/${entry.id}`}
                    className="block truncate text-[13px] text-slate-800 hover:underline dark:text-slate-100"
                  >
                    {entry.label}
                  </Link>
                  <span className="block truncate text-[11.5px] text-slate-400">{entry.sub}</span>
                </span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-slate-500">
                  {formatNumber(entry.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
