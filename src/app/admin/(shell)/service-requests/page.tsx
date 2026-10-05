import type { Metadata } from "next";
import Link from "next/link";
import { Cell, Column, DataTable, PrimaryCell, Row } from "@/components/admin/data-table";
import { Badge, Card, EmptyState, PageHeader, type BadgeTone } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatRelative } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { listQueue, type QueueFilter } from "@/lib/service-requests/admin";
import {
  CATEGORY_LABELS,
  REQUEST_CATEGORIES,
  type RequestStatus,
} from "@/lib/service-requests/fields";

export const metadata: Metadata = { title: "Service Requests" };

const BASE = "/admin/service-requests";

const COLUMNS: Column[] = [
  { key: "ticket", label: "Request" },
  { key: "student", label: "Student", secondary: true },
  { key: "category", label: "Category", secondary: true },
  { key: "status", label: "Status" },
  { key: "assigned", label: "With", secondary: true },
  { key: "target", label: "Target" },
];

const TABS: { key: QueueFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

/**
 * The support queue.
 *
 * Requests about **EduPilot** — not campus administration, which this platform
 * has no way to act on.
 *
 * **Overdue first, then by target date** — not oldest first, which buries a
 * one-day IT problem behind a stack of week-long document requests. The target
 * already encodes how long each kind is allowed to take, so sorting by it is
 * sorting by urgency.
 *
 * Scoped to the administrator's own college when they have one. There is no
 * college parameter: the scope comes from their record, so a campus admin sees
 * their students and a platform admin sees everyone without either of them asking.
 */
export default async function ServiceRequestsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requirePermission("service_request.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const requested = typeof params.filter === "string" ? (params.filter as QueueFilter) : "open";
  const filter = TABS.some((tab) => tab.key === requested) ? requested : "open";
  const category = typeof params.category === "string" ? params.category : "";
  const search = typeof params.q === "string" ? params.q : "";

  const { rows, total, counts } = await listQueue(
    { id: admin.id, collegeId: admin.collegeId },
    { filter, category: category || null, search, limit: 50 }
  );

  return (
    <>
      <PageHeader
        title="Service requests"
        description="Problems students have reported with EduPilot. Sorted by how close each one is to its target."
        breadcrumbs={[{ label: "Operations" }, { label: "Service requests" }]}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            {counts.overdue > 0 ? (
              <Badge tone="danger">{counts.overdue} overdue</Badge>
            ) : (
              <Badge tone="success">Nothing overdue</Badge>
            )}
            {counts.unassigned > 0 && <Badge tone="warning">{counts.unassigned} unassigned</Badge>}
          </span>
        }
      />

      <Card
        title={admin.collegeName ? `${admin.collegeName} students` : "All students"}
        description="Open a request to reply, reassign it or close it."
        actions={
          <form action={BASE} className="flex items-center gap-2">
            <input type="hidden" name="filter" value={filter} />
            <label htmlFor="sr-search" className="sr-only">
              Search requests
            </label>
            <input
              id="sr-search"
              name="q"
              defaultValue={search}
              placeholder="Ticket, student name or email"
              className="w-56 rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </form>
        }
      >
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5 px-4 pb-2">
          {TABS.map((tab) => {
            const active = tab.key === filter;
            const count =
              tab.key === "open"
                ? counts.open
                : tab.key === "unassigned"
                  ? counts.unassigned
                  : tab.key === "mine"
                    ? counts.mine
                    : tab.key === "overdue"
                      ? counts.overdue
                      : null;

            return (
              <a
                key={tab.key}
                href={`${BASE}?filter=${tab.key}${category ? `&category=${category}` : ""}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium transition ${
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {tab.label}
                {count ? <span className="ml-1 tabular-nums">({count})</span> : null}
              </a>
            );
          })}
        </nav>

        <nav aria-label="Category" className="flex flex-wrap gap-1.5 px-4 pb-3">
          <a
            href={`${BASE}?filter=${filter}`}
            className={`rounded-full px-2.5 py-1 text-[12px] transition ${
              category
                ? "border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
                : "bg-slate-200 font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100"
            }`}
          >
            Every category
          </a>
          {REQUEST_CATEGORIES.map((key) => (
            <a
              key={key}
              href={`${BASE}?filter=${filter}&category=${key}`}
              className={`rounded-full px-2.5 py-1 text-[12px] transition ${
                category === key
                  ? "bg-slate-200 font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                  : "border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              {CATEGORY_LABELS[key]}
            </a>
          ))}
        </nav>

        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={params}
          rowCount={rows.length}
          empty={
            <EmptyState
              title={
                filter === "open"
                  ? "Nothing open"
                  : search
                    ? "Nothing matches that search"
                    : "Nothing here"
              }
              description={
                filter === "open"
                  ? "Every request has been dealt with."
                  : "Students raise requests from their Service Requests screen."
              }
            />
          }
        >
          {rows.map((row) => (
            <Row key={row.id} highlighted={row.overdue}>
              <PrimaryCell
                title={row.subject}
                subtitle={`${row.ticket}${row.unreadForStaff > 0 ? " · new" : ""}`}
                href={`${BASE}/${row.id}`}
              />
              <Cell secondary muted>
                {row.studentName ?? "Unknown"}
                {row.studentEmail ? ` · ${row.studentEmail}` : ""}
              </Cell>
              <Cell secondary muted>
                {row.categoryLabel} · {row.typeLabel}
              </Cell>
              <Cell>
                <Badge tone={toneFor(row.status)}>{row.statusLabel}</Badge>
              </Cell>
              <Cell secondary muted>
                {row.assignedToName ?? "—"}
              </Cell>
              <Cell>
                {row.targetAt ? (
                  <span
                    className={
                      row.overdue ? "font-semibold text-rose-600 dark:text-rose-400" : undefined
                    }
                  >
                    {formatRelative(row.targetAt)}
                  </span>
                ) : (
                  "—"
                )}
              </Cell>
            </Row>
          ))}
        </DataTable>

        {total > rows.length && (
          <p className="px-4 pb-3 text-[12.5px] text-slate-400 dark:text-slate-500">
            Showing {rows.length} of {total}.{" "}
            <Link href={`${BASE}?filter=${filter}&skip=${rows.length}`} className="underline">
              Next
            </Link>
          </p>
        )}
      </Card>
    </>
  );
}

function toneFor(status: RequestStatus): BadgeTone {
  switch (status) {
    case "resolved":
      return "success";
    case "rejected":
      return "danger";
    case "awaiting_student":
      return "warning";
    case "cancelled":
      return "neutral";
    default:
      return "info";
  }
}
