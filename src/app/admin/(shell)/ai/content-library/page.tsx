import type { Metadata } from "next";
import Link from "next/link";
import {
  Cell,
  Column,
  DataTable,
  PrimaryCell,
  Row,
  TableFooter,
} from "@/components/admin/data-table";
import { TableToolbar, type FilterGroup } from "@/components/admin/table-toolbar";
import { BUTTON_STYLES, Badge, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { StatusBadge } from "@/app/admin/(shell)/ai/course-content/page";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber, formatRelative } from "@/lib/admin/format";
import { activeFilterCount, type SearchParams } from "@/lib/admin/query";
import {
  AI_CONTENT_FILTER_KEYS,
  getAiContentFacets,
  getContentStatusCounts,
  listAiContent,
} from "@/lib/admin/data/ai-content";
import {
  AI_CONTENT_STATUSES,
  AI_CONTENT_STATUS_LABELS,
} from "@/lib/admin/ai/fields";

export const metadata: Metadata = { title: "AI Content Library" };

const BASE = "/admin/ai/content-library";

const COLUMNS: Column[] = [
  { key: "subject", label: "Subject", sortKey: "subjectName" },
  { key: "contentType", label: "Content Type" },
  { key: "context", label: "Context", secondary: true },
  { key: "version", label: "Version", numeric: true },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "provider", label: "AI Provider", secondary: true },
  { key: "updated", label: "Last Updated", sortKey: "updatedAt", secondary: true },
];

/**
 * The AI Content Library (spec §20, §21).
 *
 * Everything generated, across every college — filtered and searched
 * server-side. Reuses the college module's toolbar and table so the library is
 * the same object an operator already knows how to drive, and so filter state
 * lives in the URL and can be shared or bookmarked.
 */
export default async function ContentLibraryPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("ai_course_content.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const [{ rows, total, page, limit }, facets, statusCounts] = await Promise.all([
    listAiContent(params),
    getAiContentFacets(),
    getContentStatusCounts(),
  ]);

  const filterCount = activeFilterCount(params, AI_CONTENT_FILTER_KEYS);

  const filters: FilterGroup[] = [
    {
      key: "status",
      label: "Status",
      options: AI_CONTENT_STATUSES.map((status) => ({
        value: status,
        label: AI_CONTENT_STATUS_LABELS[status],
        count: statusCounts[status] || undefined,
      })),
    },
    {
      key: "contentType",
      label: "Content Type",
      options: facets.contentTypes.map((entry) => ({
        value: entry.value,
        label: entry.label,
        count: entry.count,
      })),
    },
    {
      key: "college",
      label: "College",
      options: facets.colleges.map((entry) => ({
        value: entry.value,
        label: entry.label,
        count: entry.count,
      })),
    },
    ...(facets.providers.length
      ? [
          {
            key: "provider",
            label: "AI Provider",
            options: facets.providers.map((entry) => ({
              value: entry.value,
              label: entry.label,
              count: entry.count,
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="AI Content Library"
        description="Every piece of AI-generated content, with its academic context, version and review state."
        breadcrumbs={[{ label: "AI & Learning" }, { label: "AI Content Library" }]}
        meta={
          <Badge tone="neutral">
            {formatNumber(total)} {filterCount > 0 || params.q ? "matching" : "total"}
          </Badge>
        }
        actions={
          <Link href="/admin/ai/course-content/create" className={BUTTON_STYLES.primary}>
            Generate Content
          </Link>
        }
      />

      <Card padded={false}>
        <TableToolbar
          basePath={BASE}
          params={params}
          searchPlaceholder="Search by subject, code, college, branch or title…"
          filters={filters}
          filterKeys={AI_CONTENT_FILTER_KEYS}
        />

        {rows.length === 0 ? (
          <EmptyState
            title={filterCount > 0 || params.q ? "Nothing matches those filters" : "No content generated yet"}
            description={
              filterCount > 0 || params.q
                ? "Try removing a filter, or search for a subject code."
                : "Select an academic context and generate content for a subject to see it here."
            }
            suggestions={
              filterCount > 0 || params.q
                ? ["Clear the status filter", "Search by subject code instead of name"]
                : undefined
            }
          />
        ) : (
          <>
            <DataTable columns={COLUMNS} basePath={BASE} params={params} rowCount={rows.length}>
              {rows.map((row) => (
                <Row key={row.id}>
                  <PrimaryCell
                    href={`/admin/ai/course-content/${row.id}`}
                    title={row.subjectName ?? row.title}
                    subtitle={row.subjectCode ?? undefined}
                  />
                  <Cell>{row.contentTypeLabel}</Cell>
                  <Cell>
                    <span className="block text-[12.5px] text-slate-700 dark:text-slate-300">
                      {row.branchName ?? "—"}
                    </span>
                    <span className="block text-[11.5px] text-slate-400 dark:text-slate-500">
                      {[row.regulationCode, row.academicYearLabel, `Sem ${row.semester}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Cell>
                  <Cell numeric>{row.versionCount || "—"}</Cell>
                  <Cell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={row.status} />
                      {/*
                        Placeholder content must be identifiable in a list, or it
                        can be sent to review as though it were real (§42).
                      */}
                      {row.provider === "mock" && <Badge tone="warning">placeholder</Badge>}
                    </span>
                  </Cell>
                  <Cell>
                    {row.provider ? (
                      <span title={row.model ?? undefined}>{row.provider}</span>
                    ) : (
                      "—"
                    )}
                  </Cell>
                  <Cell>{formatRelative(row.updatedAt)}</Cell>
                </Row>
              ))}
            </DataTable>

            <TableFooter
              basePath={BASE}
              params={params}
              page={page}
              limit={limit}
              total={total}
            />
          </>
        )}
      </Card>
    </div>
  );
}
