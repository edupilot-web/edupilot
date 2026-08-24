import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ImportSteps } from "@/components/admin/import-wizard";
import { ImportRowBadge, JobStatusBadge } from "@/components/admin/status";
import { TableFooter } from "@/components/admin/data-table";
import { BUTTON_STYLES, Card, Field, FieldGrid, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatBytes, formatDateTime, formatDuration, formatNumber } from "@/lib/admin/format";
import { buildHref, type SearchParams } from "@/lib/admin/query";
import { getImportJob, getImportRowCounts, listImportRows } from "@/lib/admin/data/imports";

export const metadata: Metadata = { title: "Import result" };

type Params = Promise<{ id: string }>;

const TABS = [
  { key: "all", label: "All rows" },
  { key: "created", label: "Created" },
  { key: "updated", label: "Updated" },
  { key: "skipped", label: "Skipped" },
  { key: "invalid", label: "Errors" },
  { key: "failed", label: "Failed" },
];

/**
 * The finished import, with every row still inspectable (spec §11).
 *
 * Doubles as the "in progress" view for a job that has not been committed —
 * which is where the wizard's own links land after a refresh — so there is one
 * page that answers "what is the state of this import".
 */
export default async function ImportDetailPage(props: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await props.params;
  await requirePermission("college.import", `/admin/imports/${id}`);
  const params = await props.searchParams;

  const job = await getImportJob(id);
  if (!job) notFound();

  // Still mid-wizard: send the operator to the step they were on rather than
  // showing a results page with nothing in it.
  if (job.stage === "uploaded" || job.stage === "mapping") redirect(`/admin/imports/${id}/map`);
  if (job.stage === "validated" || job.stage === "validating") {
    redirect(`/admin/imports/${id}/review`);
  }

  const [counts, { rows, total, page, limit, status }] = await Promise.all([
    getImportRowCounts(id),
    listImportRows(id, params, "all"),
  ]);

  const base = `/admin/imports/${id}`;
  const finished = job.stage === "completed" || job.stage === "completed-with-warnings";

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Import / Export", href: "/admin/imports" },
          { label: job.fileName },
        ]}
        title={job.fileName}
        description={`${job.fileType.toUpperCase()} · ${formatBytes(job.fileSize)} · uploaded by ${job.uploadedByName ?? "unknown"} on ${formatDateTime(job.createdAt)}`}
        meta={<JobStatusBadge status={job.stage} />}
        actions={
          <Link href="/admin/colleges?source=import" className={BUTTON_STYLES.secondary}>
            View imported colleges
          </Link>
        }
      />

      {finished && <ImportSteps current="done" />}

      {job.errorMessage && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <p className="text-[13px] font-semibold text-rose-800 dark:text-rose-200">
            This import did not finish
          </p>
          <p className="mt-0.5 text-[12.5px] text-rose-700 dark:text-rose-300">{job.errorMessage}</p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total rows" value={job.totalRows} />
        <StatCard label="Created" value={job.createdCount} />
        <StatCard label="Updated" value={job.updatedCount} />
        <StatCard label="Skipped" value={job.skippedCount} />
        <StatCard
          label="Not imported"
          value={job.failedCount + job.invalidRows}
          tone={job.failedCount + job.invalidRows > 0 ? "warning" : undefined}
          hint={job.failedCount + job.invalidRows > 0 ? "Errors or write failures" : "None"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
        <div className="min-w-0">
          <Card padded={false}>
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-2 dark:border-slate-800">
              {TABS.map((tab) => (
                <Link
                  key={tab.key}
                  href={buildHref(base, {}, { status: tab.key })}
                  aria-current={tab.key === status ? "page" : undefined}
                  className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition ${
                    tab.key === status
                      ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
                  }`}
                >
                  {tab.label}
                  <span className="rounded bg-slate-100 px-1 text-[11px] tabular-nums text-slate-500 dark:bg-slate-800">
                    {counts[tab.key] ?? 0}
                  </span>
                </Link>
              ))}
            </nav>

            {rows.length === 0 ? (
              <p className="px-4 py-12 text-center text-[13px] text-slate-400">
                No rows in this category.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <li key={row.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11.5px] text-slate-400">
                        Row {row.rowNumber}
                      </span>
                      <ImportRowBadge status={row.status} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800 dark:text-slate-100">
                        {(row.mapped.name as string) ?? "—"}
                      </span>
                      {row.resultEntityId && (
                        <Link
                          href={`/admin/colleges/${row.resultEntityId}`}
                          className="shrink-0 text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Open college →
                        </Link>
                      )}
                    </div>

                    {row.failureReason && (
                      <p className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                        {row.failureReason}
                      </p>
                    )}

                    {row.errors.map((issue, index) => (
                      <p
                        key={index}
                        className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                      >
                        <span className="font-medium">{issue.field ?? "Row"}:</span> {issue.message}
                      </p>
                    ))}

                    {/* What the file actually said, kept verbatim. */}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11.5px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        Original row
                      </summary>
                      <dl className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                        {Object.entries(row.raw).map(([column, value]) => (
                          <div key={column} className="flex gap-2 text-[11.5px]">
                            <dt className="shrink-0 text-slate-400">{column}</dt>
                            <dd className="min-w-0 truncate font-mono text-slate-600 dark:text-slate-300">
                              {value || "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </li>
                ))}
              </ul>
            )}

            <TableFooter basePath={base} params={params} page={page} limit={limit} total={total} />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Job">
            <FieldGrid>
              <Field label="Status" value={<JobStatusBadge status={job.stage} />} span />
              <Field label="Started" value={formatDateTime(job.createdAt)} span />
              <Field label="Finished" value={formatDateTime(job.completedAt)} span />
              <Field label="Duration" value={formatDuration(job.durationMs)} span />
              <Field
                label="Duplicate strategy"
                value={<span className="capitalize">{job.options.duplicateStrategy}</span>}
                span
              />
              <Field
                label="Create missing universities"
                value={job.options.createMissingUniversities ? "Yes" : "No"}
                span
              />
            </FieldGrid>
          </Card>

          <Card title="Column mapping">
            <dl className="space-y-1">
              {Object.entries(job.columnMapping).map(([column, field]) => (
                <div key={column} className="flex items-baseline justify-between gap-2 text-[12px]">
                  <dt className="min-w-0 truncate text-slate-500 dark:text-slate-400">{column}</dt>
                  <dd
                    className={`shrink-0 font-mono ${
                      field ? "text-slate-700 dark:text-slate-200" : "text-slate-300 dark:text-slate-600"
                    }`}
                  >
                    {field || "ignored"}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <InfoNote>
            Imported colleges start <strong>unverified</strong>. A spreadsheet is a claim about the
            world, not a fact about it — they go into the verification queue like anything else.
            {formatNumber(job.createdCount)} are waiting there now.
          </InfoNote>
        </aside>
      </div>
    </div>
  );
}
