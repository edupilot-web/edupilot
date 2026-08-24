import type { Metadata } from "next";
import Link from "next/link";
import { BarList, ChartFrame, DonutChart, Funnel, LineChart } from "@/components/admin/charts";
import { Badge, Card, PageHeader, StatCard } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/current-admin";
import { formatRelative } from "@/lib/admin/format";
import { readParam, type SearchParams } from "@/lib/admin/query";
import {
  getAttentionItems,
  getCollegesByType,
  getDashboardKpis,
  getRecentActivity,
  getRegistrationFunnel,
  getStudentGrowth,
  getStudentsByState,
  getTopUniversities,
  type Granularity,
} from "@/lib/admin/data/dashboard";

export const metadata: Metadata = { title: "Overview" };

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/**
 * The admin dashboard.
 *
 * Ordered by what an operator needs first: the numbers, then anything demanding
 * a decision today, then the trends, then the log. "What needs attention" sits
 * above the charts because a dashboard whose actionable item is below the fold
 * is a dashboard where that item does not get actioned.
 *
 * Every query runs in parallel — they are independent, and eight sequential
 * round trips to Atlas is most of a second of nothing happening.
 */
export default async function AdminDashboardPage(props: PageProps<"/admin">) {
  const admin = await requireAdmin("/admin");
  const params = (await props.searchParams) as SearchParams;

  const granularity = (GRANULARITIES.find((entry) => entry.value === readParam(params, "range"))
    ?.value ?? "daily") as Granularity;

  const [kpis, growth, funnel, byState, byType, universities, activity, attention] =
    await Promise.all([
      getDashboardKpis(),
      getStudentGrowth(granularity),
      getRegistrationFunnel(),
      getStudentsByState(),
      getCollegesByType(),
      getTopUniversities(),
      getRecentActivity(10),
      getAttentionItems(),
    ]);

  const firstName = admin.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={`Good ${partOfDay()}, ${firstName}`}
        description="Platform state at a glance. Figures compare the last 30 days against the 30 before them."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.label === "Profile Completion" ? `${kpi.value}%` : kpi.value}
            delta={kpi.delta}
            hint={kpi.hint}
            tone={kpi.tone}
            href={kpi.href}
          />
        ))}
      </div>

      {attention.length > 0 && (
        <div className="mt-4">
          <Card
            title="Needs attention"
            description="Work that is waiting on an administrator."
            padded={false}
          >
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex items-center gap-2.5 text-[13px] text-slate-700 dark:text-slate-200">
                      <Badge
                        tone={item.tone === "danger" ? "danger" : item.tone === "warning" ? "warning" : "info"}
                      >
                        {item.count}
                      </Badge>
                      {item.label}
                    </span>
                    <span className="shrink-0 text-[12px] font-medium text-blue-600 dark:text-blue-400">
                      Review →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <ChartFrame
              title="Student growth"
              subtitle="New student registrations"
              actions={
                <div className="flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                  {GRANULARITIES.map((entry) => (
                    <Link
                      key={entry.value}
                      href={entry.value === "daily" ? "/admin" : `/admin?range=${entry.value}`}
                      aria-current={entry.value === granularity ? "true" : undefined}
                      className={`px-2 py-1 text-[11.5px] font-medium transition ${
                        entry.value === granularity
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      {entry.label}
                    </Link>
                  ))}
                </div>
              }
            >
              <LineChart points={growth} valueLabel="Student registrations" />
            </ChartFrame>
          </Card>
        </div>

        <Card>
          <ChartFrame
            title="Registration funnel"
            subtitle="Where students stop, all time"
          >
            <Funnel steps={funnel} />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <ChartFrame title="Students by state" subtitle="Resolved through each student's college">
            <BarList
              points={byState}
              href={(point) => `/admin/students?state=${encodeURIComponent(point.label)}`}
              emptyMessage="No students have selected a college with a state yet."
            />
          </ChartFrame>
        </Card>

        <Card>
          <ChartFrame title="Colleges by management" subtitle="Active colleges only">
            <DonutChart points={byType} />
          </ChartFrame>
        </Card>

        <Card>
          <ChartFrame title="Top affiliating universities" subtitle="By colleges affiliated">
            <BarList
              points={universities}
              href={(point) => `/admin/colleges?q=${encodeURIComponent(point.label)}`}
              emptyMessage="No universities have affiliated colleges yet."
            />
          </ChartFrame>
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Recent activity"
          description="The last ten recorded administrative actions."
          padded={false}
          actions={
            <Link
              href="/admin/audit"
              className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Full audit log
            </Link>
          }
        >
          {activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-400">
              Nothing has been recorded yet. Actions appear here as administrators work.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-baseline gap-3 px-4 py-2">
                  <span className="w-[130px] shrink-0 truncate text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
                    {entry.actor}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-500 dark:text-slate-400">
                    {describeAction(entry.action)}{" "}
                    <span className="text-slate-700 dark:text-slate-200">{entry.entity}</span>
                  </span>
                  {entry.severity === "critical" && <Badge tone="danger">Critical</Badge>}
                  <span className="shrink-0 text-[11.5px] text-slate-400">
                    {formatRelative(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function partOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/**
 * "college.verify" → "verified".
 *
 * A small map for the actions that read badly when mechanically de-dotted, and
 * a generic fallback for the rest, so a new action never renders as a raw key.
 */
const ACTION_PHRASES: Record<string, string> = {
  "college.create": "created",
  "college.update": "updated",
  "college.verify": "verified",
  "college.reject": "rejected verification for",
  "college.delete": "archived",
  "college.bulk.update": "bulk-updated",
  "university.create": "created university",
  "university.update": "updated university",
  "student.verify": "verified student",
  "student.suspend": "suspended",
  "import.commit": "imported",
  "admin.invite": "invited",
  "admin.login": "signed in as",
  "admin.logout": "signed out from",
  "role.permissions.update": "changed permissions on",
  "system.settings.update": "updated setting",
  "system.flag.update": "changed feature flag",
};

function describeAction(action: string): string {
  return ACTION_PHRASES[action] ?? action.replace(/\./g, " ");
}
