import type { Metadata } from "next";
import { connectDB } from "@/lib/db";
import { DownloadIcon } from "@/components/admin/icons";
import { Cell, Column, DataTable, PrimaryCell, Row } from "@/components/admin/data-table";
import { JobStatusBadge } from "@/components/admin/status";
import { Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requireAnyPermission } from "@/lib/admin/current-admin";
import { formatBytes, formatDuration, formatNumber, formatRelative } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { ExportJob } from "@/models/SystemModels";

export const metadata: Metadata = { title: "Export jobs" };

const COLUMNS: Column[] = [
  { key: "file", label: "Export" },
  { key: "by", label: "Requested by" },
  { key: "rows", label: "Rows", numeric: true },
  { key: "size", label: "Size", numeric: true, secondary: true },
  { key: "filters", label: "Filters" },
  { key: "status", label: "Status" },
  { key: "duration", label: "Duration", numeric: true, secondary: true },
  { key: "when", label: "When" },
];

/**
 * Export history (spec §12).
 *
 * Every export is a copy of data leaving the platform, so the row records the
 * exact filter that produced it. "Which students were in that spreadsheet?"
 * has to have an answer months later, and the answer is this row.
 */
export default async function ExportJobsPage(props: PageProps<"/admin/system/exports">) {
  await requireAnyPermission(["system.view", "college.export"], "/admin/system/exports");
  const params = (await props.searchParams) as SearchParams;

  await connectDB();
  const exports = await ExportJob.find({}).sort({ createdAt: -1 }).limit(100).lean();

  const now = new Date();

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Export jobs"
        description="Files generated from filtered views, and the filter each one used."
        breadcrumbs={[{ label: "System" }, { label: "Export Jobs" }]}
      />

      <Card padded={false}>
        <DataTable
          columns={COLUMNS}
          basePath="/admin/system/exports"
          params={params}
          rowCount={exports.length}
          empty={
            <EmptyState
              icon={<DownloadIcon className="h-5 w-5" />}
              title="No exports yet"
              description="Exports are started from a filtered table — the Export button on the college or student list."
            />
          }
        >
          {exports.map((entry) => {
            const expired = Boolean(entry.expiresAt && entry.expiresAt < now);
            return (
              <Row key={String(entry._id)}>
                <PrimaryCell
                  title={entry.fileName ?? `${entry.entity} export`}
                  subtitle={`${entry.format.toUpperCase()} · ${entry.scope}`}
                />
                <Cell muted nowrap>
                  {entry.requestedByName ?? "—"}
                </Cell>
                <Cell numeric muted>
                  {formatNumber(entry.rowCount)}
                </Cell>
                <Cell secondary numeric muted>
                  {formatBytes(entry.fileSize)}
                </Cell>
                <Cell muted>
                  {Object.keys(entry.filters ?? {}).length === 0 ? (
                    <span className="text-slate-300 dark:text-slate-600">no filter</span>
                  ) : (
                    <span className="font-mono text-[11.5px]">
                      {Object.entries(entry.filters as Record<string, unknown>)
                        .map(([key, value]) => `${key}=${String(value)}`)
                        .join(" ")}
                    </span>
                  )}
                </Cell>
                <Cell nowrap>
                  <JobStatusBadge status={expired ? "expired" : entry.status} />
                </Cell>
                <Cell secondary numeric muted>
                  {formatDuration(entry.durationMs)}
                </Cell>
                <Cell muted nowrap>
                  {formatRelative(entry.createdAt)}
                </Cell>
              </Row>
            );
          })}
        </DataTable>
      </Card>

      <div className="mt-4">
        <InfoNote>
          Generated files expire, but the row does not — it stays as the record that the export
          happened, who asked for it and which rows it covered. An export whose file is gone shows
          as <strong>Expired</strong> rather than disappearing.
        </InfoNote>
      </div>
    </div>
  );
}
