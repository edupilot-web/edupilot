import type { Metadata } from "next";
import Link from "next/link";
import { connectDB } from "@/lib/db";
import { DatabaseIcon, RefreshIcon } from "@/components/admin/icons";
import { JobStatusBadge, SeverityBadge } from "@/components/admin/status";
import { Badge, Card, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatDuration, formatNumber, formatRelative } from "@/lib/admin/format";
import { BackgroundJob, ErrorLog, ExportJob } from "@/models/SystemModels";
import { ImportJob } from "@/models/ImportJob";

export const metadata: Metadata = { title: "System" };

/**
 * The operational overview (spec §30).
 *
 * One page for imports, exports, jobs and errors, because an operator asking
 * "is anything broken?" should not have to visit four screens to find out. Each
 * section links to its own list.
 */
export default async function SystemPage() {
  await requirePermission("system.view", "/admin/system");
  await connectDB();

  const [jobs, exports, imports, errors, failedJobs, queuedJobs] = await Promise.all([
    BackgroundJob.find({}).sort({ createdAt: -1 }).limit(10).lean(),
    ExportJob.find({}).sort({ createdAt: -1 }).limit(8).lean(),
    ImportJob.find({}).sort({ createdAt: -1 }).limit(6).lean(),
    ErrorLog.find({}).sort({ lastSeenAt: -1 }).limit(10).lean(),
    BackgroundJob.countDocuments({ status: "failed" }),
    BackgroundJob.countDocuments({ status: "queued" }),
  ]);

  const unresolvedErrors = errors.filter((error) => !error.resolvedAt).length;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="System"
        description="Jobs, exports and errors. Everything the platform does that a person did not directly ask for."
        breadcrumbs={[{ label: "System" }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Queued jobs"
          value={queuedJobs}
          delta={null}
          hint={queuedJobs > 0 ? "Waiting to run" : "Nothing waiting"}
        />
        <StatCard
          label="Failed jobs"
          value={failedJobs}
          delta={null}
          hint={failedJobs > 0 ? "Needs attention" : "None"}
          tone={failedJobs > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Error groups"
          value={unresolvedErrors}
          delta={null}
          hint="Distinct errors, not occurrences"
          tone={unresolvedErrors > 0 ? "warning" : undefined}
        />
        <StatCard label="Imports run" value={imports.length} delta={null} hint="Most recent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Background jobs"
          description="Work the platform runs on its own."
          padded={false}
          actions={
            <Link
              href="/admin/system/jobs"
              className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              All jobs
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.map((job) => (
              <li key={String(job._id)} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <JobStatusBadge status={job.status} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800 dark:text-slate-100">
                    {job.label ?? job.type}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-slate-400">
                    {formatRelative(job.createdAt)}
                  </span>
                </div>
                {job.status === "running" && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}
                {job.errorMessage && (
                  <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    {job.errorMessage}
                    {job.attempts >= job.maxAttempts && " — no attempts left"}
                  </p>
                )}
                {job.durationMs !== null && job.status === "completed" && (
                  <p className="mt-0.5 text-[11.5px] text-slate-400">
                    took {formatDuration(job.durationMs)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Error log"
          description="Grouped by message. The count is occurrences."
          padded={false}
          actions={
            <Link
              href="/admin/system/errors"
              className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              All errors
            </Link>
          }
        >
          {errors.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-400">
              Nothing has been logged.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {errors.map((error) => (
                <li key={String(error._id)} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={error.level} />
                    <Badge tone="neutral">{error.source}</Badge>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">
                      ×{formatNumber(error.occurrences)}
                    </span>
                    <span className="ml-auto shrink-0 text-[11.5px] text-slate-400">
                      {formatRelative(error.lastSeenAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-200">
                    {error.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Recent exports"
          description="Data that has left the platform."
          padded={false}
          actions={
            <Link
              href="/admin/system/exports"
              className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              All exports
            </Link>
          }
        >
          {exports.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-400">
              No exports have been generated.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {exports.map((entry) => (
                <li
                  key={String(entry._id)}
                  className="flex flex-wrap items-center gap-2 px-4 py-2.5"
                >
                  <JobStatusBadge
                    status={
                      entry.expiresAt && entry.expiresAt < new Date() ? "expired" : entry.status
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800 dark:text-slate-100">
                    {entry.fileName ?? `${entry.entity} export`}
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">
                    {formatNumber(entry.rowCount)} rows
                  </span>
                  <span className="shrink-0 text-[11.5px] text-slate-400">
                    {entry.requestedByName ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Health" description="What the admin app depends on.">
          <ul className="space-y-2.5">
            <Health
              label="Database"
              detail="MongoDB — every page on this screen just read from it"
              ok
            />
            <Health
              label="Import pipeline"
              detail={`${imports.length} jobs recorded`}
              ok={imports.every((job) => job.stage !== "failed")}
            />
            <Health
              label="Background jobs"
              detail={failedJobs > 0 ? `${failedJobs} failed` : "No failures"}
              ok={failedJobs === 0}
            />
            <Health
              label="Email delivery"
              detail="Transport is configured in the environment, not here"
              ok
              note
            />
          </ul>

          <div className="mt-4">
            <InfoNote>
              These are read from what the platform has recorded, not from live probes. A real
              health check would ping each dependency on a schedule and write the result here — the
              shape of the page would not change.
            </InfoNote>
          </div>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { href: "/admin/system/imports", label: "Import jobs", icon: DatabaseIcon },
          { href: "/admin/system/jobs", label: "Background jobs", icon: RefreshIcon },
          { href: "/admin/system/flags", label: "Feature flags", icon: DatabaseIcon },
          { href: "/admin/settings", label: "Settings", icon: DatabaseIcon },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-[7px] text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <link.icon className="h-3.5 w-3.5" />
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Health({
  label,
  detail,
  ok,
  note,
}: {
  label: string;
  detail: string;
  ok: boolean;
  note?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          note ? "bg-slate-300" : ok ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">
          {label}
        </span>
        <span className="block text-[12px] text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
      <span className="ml-auto shrink-0">
        <Badge tone={note ? "neutral" : ok ? "success" : "danger"}>
          {note ? "Not probed" : ok ? "OK" : "Attention"}
        </Badge>
      </span>
    </li>
  );
}
