import type { Metadata } from "next";
import Link from "next/link";
import { Cell, Column, DataTable, PrimaryCell, Row, TableFooter } from "@/components/admin/data-table";
import { TableToolbar, type FilterGroup } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { JobActions } from "@/components/admin/ai/job-actions";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import { activeFilterCount, type SearchParams } from "@/lib/admin/query";
import { AI_JOB_FILTER_KEYS, listGenerationJobs } from "@/lib/admin/data/ai-content";
import { AI_JOB_STATUSES, AI_JOB_STATUS_LABELS, type AiJobStatus } from "@/lib/admin/ai/fields";

export const metadata: Metadata = { title: "AI Generation Jobs" };

const BASE = "/admin/ai/generation-jobs";

const COLUMNS: Column[] = [
  { key: "reference", label: "Job" },
  { key: "subject", label: "Subject" },
  { key: "contentType", label: "Content Type", secondary: true },
  { key: "requestedBy", label: "Requested By", secondary: true },
  { key: "duration", label: "Duration", numeric: true },
  { key: "tokens", label: "Tokens", numeric: true },
  { key: "provider", label: "Provider", secondary: true },
  { key: "status", label: "Status" },
  { key: "actions", label: "" },
];

/** Milliseconds as a readable duration. */
function duration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function jobTone(status: AiJobStatus) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "cancelled") return "neutral" as const;
  if (status === "processing") return "purple" as const;
  return "warning" as const;
}

/**
 * AI Generation Jobs (spec §19).
 *
 * The operational view of generation: what ran, how long it took, what it cost
 * and what went wrong. The error column carries the operator-facing message the
 * provider layer produced — never a stack trace or a provider payload (§32).
 */
export default async function GenerationJobsPage(props: { searchParams: Promise<SearchParams> }) {
  const admin = await requirePermission("ai_course_content.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const { rows, total, page, limit, counts } = await listGenerationJobs(params);
  const filterCount = activeFilterCount(params, AI_JOB_FILTER_KEYS);

  const filters: FilterGroup[] = [
    {
      key: "status",
      label: "Status",
      options: AI_JOB_STATUSES.map((status) => ({
        value: status,
        label: AI_JOB_STATUS_LABELS[status],
        count: counts[status] || undefined,
      })),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="AI Generation Jobs"
        description="Every generation run, with its provider, token usage, duration and outcome."
        breadcrumbs={[{ label: "AI & Learning" }, { label: "AI Generation Jobs" }]}
        meta={
          <Badge tone="neutral">
            {formatNumber(total)} {filterCount > 0 || params.q ? "matching" : "total"}
          </Badge>
        }
      />

      <Card padded={false}>
        <TableToolbar
          basePath={BASE}
          params={params}
          searchPlaceholder="Search by job reference, subject or college…"
          filters={filters}
          filterKeys={AI_JOB_FILTER_KEYS}
        />

        {rows.length === 0 ? (
          <EmptyState
            title={filterCount > 0 || params.q ? "No jobs match those filters" : "No generation jobs yet"}
            description={
              filterCount > 0 || params.q
                ? "Try clearing the status filter."
                : "Jobs appear here as soon as content is generated."
            }
          />
        ) : (
          <>
            <DataTable columns={COLUMNS} basePath={BASE} params={params} rowCount={rows.length}>
              {rows.map((row) => (
                <Row key={row.id} highlighted={row.status === "failed"}>
                  <PrimaryCell
                    title={row.reference}
                    subtitle={row.type !== "content-generation" ? row.type : undefined}
                  />
                  <Cell>
                    <span className="block text-[12.5px] text-slate-800 dark:text-slate-100">
                      {row.subjectName ?? "—"}
                    </span>
                    <span className="block text-[11.5px] text-slate-400 dark:text-slate-500">
                      {[row.collegeName, row.regulationCode, `Sem ${row.semester}`].filter(Boolean).join(" · ")}
                    </span>
                  </Cell>
                  <Cell>{row.contentTypeLabel}</Cell>
                  <Cell>{row.requestedBy ?? "—"}</Cell>
                  <Cell numeric>{duration(row.durationMs)}</Cell>
                  <Cell numeric>{row.totalTokens ? formatNumber(row.totalTokens) : "—"}</Cell>
                  <Cell>
                    {row.provider ? <span title={row.model ?? undefined}>{row.provider}</span> : "—"}
                  </Cell>
                  <Cell>
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        <Badge tone={jobTone(row.status)}>{AI_JOB_STATUS_LABELS[row.status]}</Badge>
                        {row.attempts > 1 && (
                          <span className="text-[11px] text-slate-400">attempt {row.attempts}</span>
                        )}
                      </span>
                      {row.error && (
                        <span className="max-w-[280px] text-[11.5px] leading-snug text-rose-700 dark:text-rose-300">
                          {row.error}
                        </span>
                      )}
                    </span>
                  </Cell>
                  <Cell>
                    <span className="flex items-center gap-1.5">
                      {row.courseContentId && row.status === "completed" && (
                        <Link
                          href={`/admin/ai/course-content/${row.courseContentId}`}
                          className="text-[12px] font-medium text-blue-700 hover:underline dark:text-blue-400"
                        >
                          Result
                        </Link>
                      )}
                      {can(admin, "ai_course_content.generate") && (
                        <JobActions
                          jobId={row.id}
                          status={row.status}
                          attempts={row.attempts}
                          reference={row.reference}
                        />
                      )}
                    </span>
                  </Cell>
                </Row>
              ))}
            </DataTable>

            <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
          </>
        )}
      </Card>
    </div>
  );
}
