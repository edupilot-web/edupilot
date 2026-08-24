import type { Metadata } from "next";
import { AnalyticsTabs } from "@/app/admin/(shell)/analytics/page";
import { RangeTabs } from "@/app/admin/(shell)/analytics/range-tabs";
import { BarList, ChartFrame, DonutChart, Funnel, LineChart } from "@/components/admin/charts";
import { Card, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { percentChange } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { getRegistrationFunnel, getStudentGrowth } from "@/lib/admin/data/dashboard";
import { getStudentAnalytics, readRange } from "@/lib/admin/data/analytics";

export const metadata: Metadata = { title: "Student analytics" };

const BASE = "/admin/analytics/students";

export default async function StudentAnalyticsPage(props: PageProps<"/admin/analytics/students">) {
  await requirePermission("analytics.view", BASE);
  const params = (await props.searchParams) as SearchParams;
  const range = readRange(params);

  const [students, growth, funnel] = await Promise.all([
    getStudentAnalytics(range.days),
    getStudentGrowth(range.days > 90 ? "monthly" : range.days > 30 ? "weekly" : "daily"),
    getRegistrationFunnel(),
  ]);

  const onboarded = students.total ? (students.completed / students.total) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Student analytics"
        description="Registration, onboarding completion and academic composition."
        breadcrumbs={[{ label: "Analytics" }, { label: "Students" }]}
        actions={<RangeTabs basePath={BASE} current={range.value} />}
      />

      <AnalyticsTabs current={BASE} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="New in period"
          value={students.inPeriod}
          delta={percentChange(students.inPeriod, students.inPrevious)}
          deltaLabel={`vs previous ${range.label}`}
        />
        <StatCard label="Total" value={students.total} delta={null} />
        <StatCard label="Verified" value={students.verified} delta={null} />
        <StatCard
          label="Onboarded"
          value={`${onboarded.toFixed(1)}%`}
          delta={null}
          hint="Finished both onboarding steps"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <ChartFrame title="Registrations" subtitle={`Last ${range.label}`}>
              <LineChart points={growth} valueLabel="Registrations" />
            </ChartFrame>
          </Card>
        </div>
        <Card>
          <ChartFrame title="Onboarding funnel" subtitle="Where students stop">
            <Funnel steps={funnel} />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <ChartFrame title="By year of study" subtitle="Currently studying">
            <DonutChart points={students.byYear} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="By degree" subtitle="Across all profiles">
            <BarList points={students.byDegree} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="By specialization" subtitle="Top ten branches">
            <BarList points={students.bySpecialization} />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <ChartFrame title="Graduating cohorts" subtitle="Expected graduation year">
            <BarList points={students.graduating} />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Sign-in method" subtitle="How they registered">
            <DonutChart points={students.byProvider} />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4">
        <InfoNote>
          &ldquo;Onboarded&rdquo; means both onboarding steps were finished — not that the student
          came back. The platform records no sessions yet, so a genuine returning-user figure would
          be invented rather than measured, and is left out until it can be.
        </InfoNote>
      </div>
    </div>
  );
}
