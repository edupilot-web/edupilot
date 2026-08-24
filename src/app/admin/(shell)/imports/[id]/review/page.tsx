import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CommitPanel, ImportSteps } from "@/components/admin/import-wizard";
import { ImportRowBadge } from "@/components/admin/status";
import { TableFooter } from "@/components/admin/data-table";
import { Badge, BUTTON_STYLES, Card, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { cancelImportAction, resolveAllAction, resolveRowAction } from "@/lib/admin/actions/imports";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import { buildHref, type SearchParams } from "@/lib/admin/query";
import {
  countUnresolvedDuplicates,
  getImportJob,
  getImportRowCounts,
  listImportRows,
} from "@/lib/admin/data/imports";

export const metadata: Metadata = { title: "Review import" };

type Params = Promise<{ id: string }>;

const TABS = [
  { key: "invalid", label: "Errors" },
  { key: "duplicate", label: "Duplicates" },
  { key: "warning", label: "Warnings" },
  { key: "valid", label: "Ready" },
  { key: "all", label: "All rows" },
];

const RESOLUTIONS = [
  { value: "keep-existing", label: "Keep existing" },
  { value: "update-existing", label: "Update existing" },
  { value: "create-new", label: "Create new" },
  { value: "skip", label: "Skip" },
];

/**
 * Steps 3–6 on one screen: validation summary, the error table, duplicate
 * resolution and the preview.
 *
 * The spec describes them as separate steps, and they are separate *concerns* —
 * but an operator fixing duplicates needs the error count in view, and one
 * screen with tabs is fewer round trips than four pages each re-reading the
 * same job. The commit is still a distinct, confirmed act.
 */
export default async function ReviewImportPage(props: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await props.params;
  await requirePermission("college.import", `/admin/imports/${id}/review`);
  const params = await props.searchParams;

  const job = await getImportJob(id);
  if (!job) notFound();
  if (["completed", "completed-with-warnings", "cancelled"].includes(job.stage)) {
    redirect(`/admin/imports/${id}`);
  }
  if (job.stage === "mapping" || job.stage === "uploaded") {
    redirect(`/admin/imports/${id}/map`);
  }

  const [counts, unresolved, { rows, total, page, limit, status }] = await Promise.all([
    getImportRowCounts(id),
    countUnresolvedDuplicates(id),
    listImportRows(id, params, counts0(params) ?? "invalid"),
  ]);

  const base = `/admin/imports/${id}/review`;

  // What the commit would do, given the current per-row decisions.
  const toUpdate =
    job.options.duplicateStrategy === "update"
      ? (counts.duplicate ?? 0) - unresolved
      : 0;
  const toCreate = (counts.valid ?? 0) + (counts.warning ?? 0);
  const toSkip = (counts.duplicate ?? 0) - toUpdate;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Import / Export", href: "/admin/imports" },
          { label: job.fileName },
        ]}
        title="Validate and review"
        description="What we found in the file. Nothing has been written yet."
        actions={
          <form action={cancelImportAction}>
            <input type="hidden" name="jobId" value={id} />
            <button type="submit" className={BUTTON_STYLES.danger}>
              Abandon this import
            </button>
          </form>
        }
      />

      <ImportSteps current="review" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total rows" value={job.totalRows} />
        <StatCard label="Ready" value={counts.valid ?? 0} />
        <StatCard label="Warnings" value={counts.warning ?? 0} />
        <StatCard
          label="Duplicates"
          value={counts.duplicate ?? 0}
          hint={unresolved > 0 ? `${unresolved} undecided` : "All decided"}
          tone={unresolved > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Errors"
          value={counts.invalid ?? 0}
          hint={(counts.invalid ?? 0) > 0 ? "Will not be imported" : "None"}
          tone={(counts.invalid ?? 0) > 0 ? "warning" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Card padded={false}>
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-2 dark:border-slate-800">
              {TABS.map((tab) => {
                const active = tab.key === status;
                const count = counts[tab.key] ?? 0;
                return (
                  <Link
                    key={tab.key}
                    href={buildHref(base, {}, { status: tab.key })}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition ${
                      active
                        ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                        : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {tab.label}
                    <span className="rounded bg-slate-100 px-1 text-[11px] tabular-nums text-slate-500 dark:bg-slate-800">
                      {count}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {rows.length === 0 ? (
              <p className="px-4 py-12 text-center text-[13px] text-slate-400">
                No rows in this category.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11.5px] text-slate-400">
                        Row {row.rowNumber}
                      </span>
                      <ImportRowBadge status={row.status} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                        {(row.mapped.name as string) ?? row.raw[Object.keys(row.raw)[0]] ?? "—"}
                      </span>
                      {row.matchScore !== null && (
                        <Badge tone={row.matchScore >= 90 ? "danger" : "warning"}>
                          {row.matchScore}% match
                        </Badge>
                      )}
                    </div>

                    {row.errors.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {row.errors.map((issue, index) => (
                          <li
                            key={index}
                            className="rounded-md bg-rose-50 px-2 py-1 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                          >
                            <span className="font-medium">{issue.field ?? "Row"}:</span>{" "}
                            {issue.message}
                            {issue.value && (
                              <span className="ml-1 font-mono text-rose-500">
                                &ldquo;{issue.value}&rdquo;
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {row.warnings.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {row.warnings.map((issue, index) => (
                          <li
                            key={index}
                            className="rounded-md bg-amber-50 px-2 py-1 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                          >
                            <span className="font-medium">{issue.field ?? "Row"}:</span>{" "}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}

                    {row.status === "duplicate" && (
                      <div className="mt-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[12.5px] text-slate-600 dark:text-slate-300">
                            Matches{" "}
                            <Link
                              href={`/admin/colleges/${row.matchedEntityId}`}
                              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {row.matchedEntityLabel}
                            </Link>
                          </p>
                          {row.resolution && (
                            <Badge tone="info">
                              {RESOLUTIONS.find((entry) => entry.value === row.resolution)?.label}
                            </Badge>
                          )}
                        </div>

                        {row.matchReasons.length > 0 && (
                          <p className="mt-0.5 text-[11.5px] text-slate-400">
                            {row.matchReasons.join(" · ")}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {RESOLUTIONS.map((entry) => (
                            <form key={entry.value} action={resolveRowAction}>
                              <input type="hidden" name="jobId" value={id} />
                              <input type="hidden" name="rowId" value={row.id} />
                              <input type="hidden" name="resolution" value={entry.value} />
                              <button
                                type="submit"
                                className={`rounded-md px-2 py-1 text-[11.5px] font-medium ring-1 ring-inset transition ${
                                  row.resolution === entry.value
                                    ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900"
                                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
                                }`}
                              >
                                {entry.label}
                              </button>
                            </form>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <TableFooter basePath={base} params={params} page={page} limit={limit} total={total} />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="What will happen">
            <dl className="space-y-2">
              <Line label="Colleges created" value={toCreate} tone="success" />
              <Line label="Existing updated" value={toUpdate} tone="info" />
              <Line label="Skipped" value={toSkip} />
              <Line label="Not imported (errors)" value={counts.invalid ?? 0} tone="danger" />
            </dl>

            <div className="mt-4">
              <CommitPanel
                jobId={id}
                toCreate={toCreate}
                toUpdate={toUpdate}
                toSkip={toSkip}
                invalid={counts.invalid ?? 0}
              />
            </div>
          </Card>

          {(counts.duplicate ?? 0) > 0 && (
            <Card title="Resolve every duplicate" description="Applies one decision to all of them.">
              <div className="space-y-1.5">
                {RESOLUTIONS.map((entry) => (
                  <form key={entry.value} action={resolveAllAction}>
                    <input type="hidden" name="jobId" value={id} />
                    <input type="hidden" name="resolution" value={entry.value} />
                    <button type="submit" className={`${BUTTON_STYLES.secondary} w-full`}>
                      {entry.label} for all {counts.duplicate}
                    </button>
                  </form>
                ))}
              </div>
            </Card>
          )}

          <InfoNote>
            Rows with errors are never imported — fixing them means correcting the file and running
            a second import. Everything the wizard decided is kept against the job, so you can come
            back months later and see exactly what row 412 said.
          </InfoNote>
        </aside>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "info" | "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`text-[14px] font-semibold tabular-nums ${
          tone === "success"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "danger" && value > 0
              ? "text-rose-600 dark:text-rose-400"
              : tone === "info"
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {formatNumber(value)}
      </dd>
    </div>
  );
}

/** The status tab from the URL, before counts are known. */
function counts0(params: SearchParams): string | undefined {
  const value = params.status;
  return typeof value === "string" ? value : undefined;
}
