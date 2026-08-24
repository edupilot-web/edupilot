import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, UploadIcon } from "@/components/admin/icons";
import { Cell, Column, DataTable, PrimaryCell, Row, TableFooter } from "@/components/admin/data-table";
import { JobStatusBadge } from "@/components/admin/status";
import { BUTTON_STYLES, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { can, requireAnyPermission } from "@/lib/admin/current-admin";
import { formatDuration, formatNumber, formatRelative } from "@/lib/admin/format";
import { buildHref, readParam, type SearchParams } from "@/lib/admin/query";
import { listImportJobs } from "@/lib/admin/data/imports";

export const metadata: Metadata = { title: "Import & export" };

const BASE = "/admin/imports";

const COLUMNS: Column[] = [
  { key: "file", label: "File" },
  { key: "by", label: "Uploaded by", secondary: true },
  { key: "rows", label: "Rows", numeric: true },
  { key: "created", label: "Created", numeric: true },
  { key: "updated", label: "Updated", numeric: true },
  { key: "skipped", label: "Skipped", numeric: true, secondary: true },
  { key: "failed", label: "Failed", numeric: true },
  { key: "status", label: "Status" },
  { key: "duration", label: "Duration", numeric: true, secondary: true },
  { key: "when", label: "When" },
];

const STAGES = [
  { value: "completed", label: "Completed" },
  { value: "completed-with-warnings", label: "With warnings" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "mapping", label: "In progress" },
];

/**
 * Import history (spec §11).
 *
 * Rows of every job are kept after it finishes, so an operator can open a
 * six-month-old import and see exactly what line 412 of the spreadsheet said.
 * That is the question that arrives when a college complains its name is wrong.
 */
export default async function ImportsPage(props: PageProps<"/admin/imports">) {
  const admin = await requireAnyPermission(["college.import", "college.export"], BASE);
  const params = (await props.searchParams) as SearchParams;

  const { rows, total, page, limit } = await listImportJobs(params);
  const stage = readParam(params, "stage");

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Import & export"
        description="Bulk loads of institution data, and the files generated from filtered views."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Import / Export" }]}
        actions={
          <>
            {can(admin, "college.export") && (
              <Link href="/admin/system/exports" className={BUTTON_STYLES.secondary}>
                <DownloadIcon className="h-3.5 w-3.5" />
                Export history
              </Link>
            )}
            {can(admin, "college.import") && (
              <Link href="/admin/imports/new" className={BUTTON_STYLES.primary}>
                <UploadIcon className="h-3.5 w-3.5" />
                New import
              </Link>
            )}
          </>
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span className="mr-1 text-[12px] text-slate-400">Status</span>
          <Link
            href={BASE}
            aria-current={!stage ? "true" : undefined}
            className={chip(!stage)}
          >
            All
          </Link>
          {STAGES.map((entry) => (
            <Link
              key={entry.value}
              href={buildHref(BASE, params, { stage: entry.value })}
              aria-current={stage === entry.value ? "true" : undefined}
              className={chip(stage === entry.value)}
            >
              {entry.label}
            </Link>
          ))}
        </div>

        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={params}
          rowCount={rows.length}
          empty={
            <EmptyState
              icon={<UploadIcon className="h-5 w-5" />}
              title="No imports yet"
              description="Bulk-load colleges from a CSV or Excel file. Nothing is written until you have seen exactly what would change."
              action={
                can(admin, "college.import") ? (
                  <Link href="/admin/imports/new" className={BUTTON_STYLES.primary}>
                    Start an import
                  </Link>
                ) : undefined
              }
            />
          }
        >
          {rows.map((row) => (
            <Row key={row.id} highlighted={row.stage === "failed"}>
              <PrimaryCell
                href={`${BASE}/${row.id}`}
                title={row.fileName}
                subtitle={row.fileType.toUpperCase()}
              />
              <Cell secondary muted nowrap>
                {row.uploadedByName}
              </Cell>
              <Cell numeric muted>
                {formatNumber(row.totalRows)}
              </Cell>
              <Cell numeric>
                {row.createdCount > 0 ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {formatNumber(row.createdCount)}
                  </span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">0</span>
                )}
              </Cell>
              <Cell numeric muted>
                {formatNumber(row.updatedCount)}
              </Cell>
              <Cell secondary numeric muted>
                {formatNumber(row.skippedCount)}
              </Cell>
              <Cell numeric>
                {row.failedCount + row.invalidRows > 0 ? (
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    {formatNumber(row.failedCount + row.invalidRows)}
                  </span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">0</span>
                )}
              </Cell>
              <Cell nowrap>
                <JobStatusBadge status={row.stage} />
              </Cell>
              <Cell secondary numeric muted>
                {formatDuration(row.durationMs)}
              </Cell>
              <Cell muted nowrap>
                {formatRelative(row.createdAt)}
              </Cell>
            </Row>
          ))}
        </DataTable>

        <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
      </Card>

      <div className="mt-4">
        <InfoNote>
          Every parsed row is kept against its job — what the file said, what it was mapped to, which
          duplicate it matched and what was written. Open any import to inspect a single row.
        </InfoNote>
      </div>
    </div>
  );
}

function chip(active: boolean): string {
  return `rounded-md px-2 py-1 text-[12px] font-medium ring-1 ring-inset transition ${
    active
      ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white"
      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
  }`;
}
