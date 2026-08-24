import type { Metadata } from "next";
import Link from "next/link";
import { ListIcon } from "@/components/admin/icons";
import { SeverityBadge } from "@/components/admin/status";
import { TableFooter } from "@/components/admin/data-table";
import { TableToolbar, type FilterGroup } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/admin/format";
import { DATE_PRESETS, readParam, type SearchParams } from "@/lib/admin/query";
import { AUDIT_FILTER_KEYS, getAuditFacets, listAuditLog } from "@/lib/admin/data/administration";

export const metadata: Metadata = { title: "Audit log" };

const BASE = "/admin/audit";

/**
 * The audit trail (spec §29).
 *
 * Rendered as a timeline rather than a table because the interesting part of a
 * row is the *diff*, and a diff does not fit in a column. Filtering, sorting and
 * paging still work the same way as every other list.
 */
export default async function AuditLogPage(props: PageProps<"/admin/audit">) {
  await requirePermission("audit.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const [{ rows, total, page, limit }, facets] = await Promise.all([
    listAuditLog(params),
    getAuditFacets(),
  ]);

  const entityId = readParam(params, "entityId");

  const filters: FilterGroup[] = [
    {
      key: "severity",
      label: "Severity",
      options: [
        { value: "critical", label: "Critical" },
        { value: "notice", label: "Notice" },
        { value: "info", label: "Info" },
      ],
    },
    {
      key: "entityType",
      label: "Entity",
      options: facets.entityTypes.map((type) => ({ value: type, label: type })),
    },
    {
      key: "actor",
      label: "Actor",
      options: facets.actors.slice(0, 8).map((actor) => ({ value: actor.id, label: actor.name })),
    },
    {
      key: "created",
      label: "When",
      single: true,
      options: DATE_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Audit log"
        description="Every administrative action, with what changed and who changed it. Append-only — nothing in the app edits or deletes a row here."
        breadcrumbs={[{ label: "Administration" }, { label: "Audit Logs" }]}
        meta={<Badge tone="neutral">{formatNumber(total)} entries</Badge>}
      />

      {entityId && (
        <div className="mb-4">
          <InfoNote>
            Filtered to one record.{" "}
            <Link href={BASE} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Show everything
            </Link>
          </InfoNote>
        </div>
      )}

      <Card padded={false}>
        <TableToolbar
          basePath={BASE}
          params={params}
          searchPlaceholder="Search by record name, administrator or action…"
          filters={filters}
          filterKeys={AUDIT_FILTER_KEYS}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<ListIcon className="h-5 w-5" />}
            title="No matching entries"
            description="Nothing recorded matches the current filters."
            suggestions={["Widen the date range", "Clear the severity filter"]}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-slate-900 dark:text-white">
                    {row.actorName}
                  </span>
                  {row.actorRole && (
                    <span className="text-[11.5px] text-slate-400">{row.actorRole}</span>
                  )}
                  <span className="font-mono text-[12px] text-slate-500 dark:text-slate-400">
                    {row.action}
                  </span>
                  {row.entityLabel && (
                    <>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      {row.entityId ? (
                        <Link
                          href={entityHref(row.entityType, row.entityId)}
                          className="text-[12.5px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {row.entityLabel}
                        </Link>
                      ) : (
                        <span className="text-[12.5px] text-slate-600 dark:text-slate-300">
                          {row.entityLabel}
                        </span>
                      )}
                    </>
                  )}
                  {row.severity !== "info" && <SeverityBadge severity={row.severity} />}
                  {row.batchId && <Badge tone="neutral">bulk</Badge>}

                  <span
                    className="ml-auto shrink-0 text-[11.5px] text-slate-400"
                    title={formatDateTime(row.at)}
                  >
                    {formatRelative(row.at)}
                  </span>
                </div>

                {row.after && Object.keys(row.after).length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {Object.entries(row.after).map(([field, value]) => (
                      <li key={field} className="text-[12px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono text-slate-400">{field}</span>{" "}
                        <span className="text-rose-600 line-through dark:text-rose-400">
                          {render(row.before?.[field])}
                        </span>{" "}
                        <span aria-hidden="true">→</span>{" "}
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          {render(value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {row.metadata?.note ? (
                  <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[12px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    {String(row.metadata.note)}
                  </p>
                ) : null}

                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                  {row.actorEmail && <span>{row.actorEmail}</span>}
                  {row.ip && <span className="font-mono">{row.ip}</span>}
                  <span>{formatDate(row.at)}</span>
                  {row.actorType !== "admin" && (
                    <span className="capitalize">via {row.actorType}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
      </Card>

      <div className="mt-4">
        <InfoNote>
          Entries hold only the fields that changed, not whole documents — a diff is what a reviewer
          wants to read, and full snapshots of student records would spread personal data across a
          collection kept far longer than the records themselves.
        </InfoNote>
      </div>
    </div>
  );
}

/** Where an audited entity lives, so its label can be a link. */
function entityHref(entityType: string, id: string): string {
  switch (entityType) {
    case "College":
      return `/admin/colleges/${id}`;
    case "University":
      return `/admin/universities/${id}`;
    case "StudentProfile":
      return `/admin/students/${id}`;
    case "AdminUser":
      return `/admin/team/${id}`;
    case "Role":
      return `/admin/roles/${id}`;
    case "ImportJob":
      return `/admin/imports/${id}`;
    default:
      return `/admin/audit?entityType=${entityType}&entityId=${id}`;
  }
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
