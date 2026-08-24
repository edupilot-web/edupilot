import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Badge, Card, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatBytes, formatDuration, formatNumber } from "@/lib/admin/format";
import { measureHealth } from "@/lib/admin/data/health";

export const metadata: Metadata = { title: "Platform health" };

/**
 * Platform health.
 *
 * Every figure is measured when the page is requested — the database round trip
 * is timed, the collection sizes read, the email transport asked whether it is
 * configured. Nothing here is a stored status that could be stale, and nothing
 * is a green light meaning "we assume so".
 */
export default async function HealthPage() {
  await requirePermission("system.view", "/admin/health");

  const health = await measureHealth();

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="Platform health"
        description="Measured now, not read from a stored status. Reload to take the measurement again."
        breadcrumbs={[{ label: "Dashboard" }, { label: "Platform Health" }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Database ping"
          value={`${health.database.pingMs}ms`}
          delta={null}
          hint={health.database.ok ? "Responding" : "Failed"}
          tone={health.database.ok ? undefined : "warning"}
        />
        <StatCard
          label="Connect time"
          value={`${health.database.connectMs}ms`}
          delta={null}
          hint="Cached after the first call"
        />
        <StatCard
          label="Failed jobs"
          value={health.operations.failedJobs}
          delta={null}
          tone={health.operations.failedJobs > 0 ? "warning" : undefined}
          hint={health.operations.failedJobs > 0 ? "Needs attention" : "None"}
        />
        <StatCard
          label="Errors (24h)"
          value={health.operations.errorGroups24h}
          delta={null}
          tone={health.operations.errorGroups24h > 0 ? "warning" : undefined}
          hint="Distinct groups"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Database">
          <dl className="space-y-2.5">
            <Line
              label="Status"
              value={
                <Badge tone={health.database.ok ? "success" : "danger"}>
                  {health.database.ok ? "Connected" : "Unreachable"}
                </Badge>
              }
            />
            <Line label="Database" value={health.database.name ?? "—"} />
            <Line label="Host" value={health.database.host ?? "—"} />
            <Line
              label="Collections"
              value={health.database.collections ? formatNumber(health.database.collections) : "—"}
            />
            <Line
              label="Data size"
              value={health.database.dataSize ? formatBytes(health.database.dataSize) : "—"}
            />
            <Line
              label="Index size"
              value={health.database.indexSize ? formatBytes(health.database.indexSize) : "—"}
            />
          </dl>
          {health.database.error && (
            <p className="mt-3 rounded-md bg-rose-50 px-2.5 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {health.database.error}
            </p>
          )}
        </Card>

        <Card title="Email delivery">
          <dl className="space-y-2.5">
            <Line
              label="Status"
              value={
                <Badge tone={health.email.ready ? "success" : "danger"}>
                  {health.email.ready ? "Configured" : "Not configured"}
                </Badge>
              }
            />
            <Line label="Transport" value={health.email.transport} />
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            {health.email.transport === "console"
              ? "The console transport logs messages instead of sending them. Fine for development; it refuses to run in production."
              : "Verification emails go out through this transport. Credentials live in the environment, not in Settings."}
          </p>
        </Card>

        <Card title="Data volume">
          <dl className="space-y-2.5">
            <Line label="Colleges" value={formatNumber(health.volume.colleges)} />
            <Line label="User accounts" value={formatNumber(health.volume.users)} />
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Estimated from collection metadata rather than counted — an exact count of a large
            collection is a scan, and this page should never be the slow one.
          </p>
        </Card>

        <Card title="Response">
          <dl className="space-y-2.5">
            <Line label="Measurement took" value={formatDuration(health.totalMs)} />
            <Line label="Runtime" value={health.runtime} />
            <Line label="Environment" value={health.environment} />
          </dl>
        </Card>
      </div>

      <div className="mt-4">
        <InfoNote>
          There is no monitoring agent behind this page. It measures what it can from inside a
          request — honest, and enough to answer &ldquo;is the database slow right now?&rdquo; — but
          uptime history, alerting and dependency probes need something running outside the app.
        </InfoNote>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}
