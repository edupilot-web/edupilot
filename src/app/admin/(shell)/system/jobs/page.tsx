import type { Metadata } from "next";
import { connectDB } from "@/lib/db";
import { RefreshIcon } from "@/components/admin/icons";
import { Cell, Column, DataTable, PrimaryCell, Row } from "@/components/admin/data-table";
import { JobStatusBadge } from "@/components/admin/status";
import { Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatDuration, formatRelative } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { BackgroundJob } from "@/models/SystemModels";

export const metadata: Metadata = { title: "Background jobs" };

const COLUMNS: Column[] = [
  { key: "job", label: "Job" },
  { key: "status", label: "Status" },
  { key: "progress", label: "Progress", numeric: true },
  { key: "attempts", label: "Attempts", numeric: true, secondary: true },
  { key: "duration", label: "Duration", numeric: true },
  { key: "when", label: "Started" },
];

export default async function BackgroundJobsPage(props: PageProps<"/admin/system/jobs">) {
  await requirePermission("system.view", "/admin/system/jobs");
  const params = (await props.searchParams) as SearchParams;

  await connectDB();
  const jobs = await BackgroundJob.find({}).sort({ createdAt: -1 }).limit(100).lean();

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Background jobs"
        description="Work the platform runs on its own — recounts, scans, campaigns."
        breadcrumbs={[{ label: "System" }, { label: "Background Jobs" }]}
      />

      <Card padded={false}>
        <DataTable
          columns={COLUMNS}
          basePath="/admin/system/jobs"
          params={params}
          rowCount={jobs.length}
          empty={
            <EmptyState
              icon={<RefreshIcon className="h-5 w-5" />}
              title="No jobs recorded"
              description="Background work appears here as it is queued and run."
            />
          }
        >
          {jobs.map((job) => (
            <Row key={String(job._id)} highlighted={job.status === "failed"}>
              <PrimaryCell title={job.label ?? job.type} subtitle={job.type} />
              <Cell nowrap>
                <JobStatusBadge status={job.status} />
              </Cell>
              <Cell numeric muted>
                {job.status === "completed" ? "100%" : `${job.progress}%`}
              </Cell>
              <Cell secondary numeric muted>
                {job.attempts}/{job.maxAttempts}
              </Cell>
              <Cell numeric muted>
                {formatDuration(job.durationMs)}
              </Cell>
              <Cell muted nowrap>
                {formatRelative(job.startedAt ?? job.createdAt)}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      {jobs.some((job) => job.errorMessage) && (
        <div className="mt-4">
          <Card title="Failures" padded={false}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs
                .filter((job) => job.errorMessage)
                .map((job) => (
                  <li key={String(job._id)} className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                      {job.label ?? job.type}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-rose-700 dark:text-rose-300">
                      {job.errorMessage}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      {job.attempts} of {job.maxAttempts} attempts ·{" "}
                      {formatRelative(job.finishedAt ?? job.createdAt)}
                    </p>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mt-4">
        <InfoNote>
          There is no worker process yet — these rows are written by the seed and by code paths that
          record what they did. Retry and cancel are deliberately absent rather than present and
          inert: a button that looks like it retries a job and does nothing is worse than no button.
        </InfoNote>
      </div>
    </div>
  );
}
