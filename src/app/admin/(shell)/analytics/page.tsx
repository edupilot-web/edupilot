import type { Metadata } from "next";
import Link from "next/link";
import { RangeTabs } from "@/app/admin/(shell)/analytics/range-tabs";
import { BarList, ChartFrame, DonutChart, Funnel, LineChart } from "@/components/admin/charts";
import { Card, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { percentChange } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import {
  getCollegesByState,
  getRegistrationFunnel,
  getStudentGrowth,
  getStudentsByState,
} from "@/lib/admin/data/dashboard";
import { getInstitutionAnalytics, getStudentAnalytics, readRange } from "@/lib/admin/data/analytics";

export const metadata: Metadata = { title: "Analytics" };

const BASE = "/admin/analytics";

const TABS = [
  { href: BASE, label: "Overview" },
  { href: `${BASE}/students`, label: "Students" },
  { href: `${BASE}/institutions`, label: "Institutions" },
  { href: `${BASE}/geography`, label: "Geography" },
];

export default async function AnalyticsOverviewPage(props: PageProps<"/admin/analytics">) {
  await requirePermission("analytics.view", BASE);
  const params = (await props.searchParams) as SearchParams;
  const range = readRange(params);

  const [students, institutions, growth, funnel, studentsByState, collegesByState] =
    await Promise.all([
      getStudentAnalytics(range.days),
      getInstitutionAnalytics(),
      getStudentGrowth(range.days > 90 ? "monthly" : range.days > 30 ? "weekly" : "daily"),
      getRegistrationFunnel(),
      getStudentsByState(10),
      getCollegesByState(10),
    ]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Analytics"
        description={`Platform growth and composition. Figures cover the last ${range.label}.`}
        breadcrumbs={[{ label: "Analytics" }, { label: "Overview" }]}
        actions={<RangeTabs basePath={BASE} current={range.value} />}
      />

      <AnalyticsTabs current={BASE} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="New students"
          value={students.inPeriod}
          delta={percentChange(students.inPeriod, students.inPrevious)}
          deltaLabel={`vs previous ${range.label}`}
        />
        <StatCard label="Total students" value={students.total} delta={null} />
        <StatCard
          label="Email verified"
          value={students.verified}
          delta={null}
          hint={
            students.total
              ? `${((students.verified / students.total) * 100).toFixed(1)}% of accounts`
              : undefined
          }
        />
        <StatCard
          label="Profiles completed"
          value={students.completed}
          delta={null}
          hint={
            students.total
              ? `${((students.completed / students.total) * 100).toFixed(1)}% of accounts`
              : undefined
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <ChartFrame title="Registrations" subtitle={`Over the last ${range.label}`}>
              <LineChart points={growth} valueLabel="Registrations" />
            </ChartFrame>
          </Card>
        </div>
        <Card>
          <ChartFrame title="Registration funnel" subtitle="All time">
            <Funnel steps={funnel} />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <ChartFrame title="Students by state" subtitle="Through their college">
            <BarList
              points={studentsByState}
              href={(point) => `${BASE}/geography?state=${encodeURIComponent(point.label)}`}
            />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Colleges by state" subtitle="Active colleges">
            <BarList
              points={collegesByState}
              href={(point) => `/admin/colleges?state=${encodeURIComponent(point.label)}`}
            />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Sign-in method" subtitle="How students registered">
            <DonutChart points={students.byProvider} />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <ChartFrame title="Colleges by verification" subtitle="Directory health">
            <DonutChart points={institutions.byVerification} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Top affiliating universities" subtitle="By colleges affiliated">
            <BarList
              points={institutions.topUniversities}
              href={(point) => `/admin/colleges?q=${encodeURIComponent(point.label)}`}
            />
          </ChartFrame>
        </Card>
      </div>
    </div>
  );
}

export function AnalyticsTabs({ current }: { current: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition ${
            tab.href === current
              ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
