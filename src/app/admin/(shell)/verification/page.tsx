import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheckIcon } from "@/components/admin/icons";
import { BulkBar } from "@/components/admin/bulk-bar";
import { RowCheckbox, SelectionScope } from "@/components/admin/selection";
import { VerificationBadge } from "@/components/admin/status";
import { TableFooter } from "@/components/admin/data-table";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { bulkCollegeAction } from "@/lib/admin/actions/colleges";
import { bulkStudentAction } from "@/lib/admin/actions/students";
import { can, requireAnyPermission } from "@/lib/admin/current-admin";
import { formatDate, formatNumber, formatRelative } from "@/lib/admin/format";
import { buildHref, type SearchParams } from "@/lib/admin/query";
import { getQueueCounts, listQueue, readQueueKind, type QueueKind } from "@/lib/admin/data/verification";

export const metadata: Metadata = { title: "Verification queue" };

const BASE = "/admin/verification";

const TABS: { key: QueueKind; label: string; permission: string }[] = [
  { key: "colleges", label: "Colleges", permission: "college.verify" },
  { key: "universities", label: "Universities", permission: "university.verify" },
  { key: "students", label: "Students", permission: "student.verify" },
];

/**
 * Everything waiting on an administrator's decision (spec §19).
 *
 * Oldest first, always. A queue sorted newest-first grows a tail nobody ever
 * reaches, and the records at the bottom are exactly the ones that have been
 * waiting longest.
 */
export default async function VerificationQueuePage(props: PageProps<"/admin/verification">) {
  const admin = await requireAnyPermission(
    ["college.verify", "university.verify", "student.verify"],
    BASE
  );
  const params = (await props.searchParams) as SearchParams;

  const kind = readQueueKind(params);
  const [counts, { items, total, page, limit }] = await Promise.all([
    getQueueCounts(),
    listQueue(kind, params),
  ]);

  const visibleTabs = TABS.filter((tab) => can(admin, tab.permission));
  const canActOnThisTab = visibleTabs.some((tab) => tab.key === kind);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Verification queue"
        description="Records waiting on a decision, oldest first. Every decision is written to the audit log with its reason."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Verification" }]}
        meta={
          <Badge tone={counts.colleges + counts.universities + counts.students > 0 ? "warning" : "success"}>
            {formatNumber(counts.colleges + counts.universities + counts.students)} waiting
          </Badge>
        }
      />

      <SelectionScope pageIds={items.map((item) => item.id)}>
        <Card padded={false}>
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-2 dark:border-slate-800">
            {visibleTabs.map((tab) => {
              const active = tab.key === kind;
              return (
                <Link
                  key={tab.key}
                  href={buildHref(BASE, {}, { kind: tab.key === "colleges" ? null : tab.key })}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    active
                      ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded px-1 text-[11px] tabular-nums ${
                      counts[tab.key] > 0
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                    }`}
                  >
                    {counts[tab.key]}
                  </span>
                </Link>
              );
            })}
          </nav>

          {items.length === 0 ? (
            <EmptyState
              icon={<ShieldCheckIcon className="h-5 w-5" />}
              title="Nothing is waiting"
              description="This queue is clear. Records appear here when they are submitted or flagged for review."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  {canActOnThisTab && (
                    <span className="pt-0.5">
                      <RowCheckbox id={item.id} label={item.title} />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={item.href}
                        className="truncate text-[13.5px] font-medium text-slate-900 hover:text-blue-700 hover:underline dark:text-white dark:hover:text-blue-400"
                      >
                        {item.title}
                      </Link>
                      <VerificationBadge status={item.status} />
                    </div>
                    {item.subtitle && (
                      <p className="mt-0.5 truncate text-[12px] text-slate-400 dark:text-slate-500">
                        {item.subtitle}
                      </p>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px]">
                      {item.detail && (
                        <span className="text-slate-500 dark:text-slate-400">{item.detail}</span>
                      )}
                      {item.reason && (
                        <span className="text-amber-700 dark:text-amber-400">{item.reason}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className="text-[12px] text-slate-500 dark:text-slate-400"
                      title={formatDate(item.waitingSince)}
                    >
                      waiting {formatRelative(item.waitingSince).replace(" ago", "")}
                    </p>
                    <Link
                      href={item.href}
                      className="mt-0.5 inline-block text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Review →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <TableFooter
            basePath={BASE}
            params={params}
            page={page}
            limit={limit}
            total={total}
          />
        </Card>

        <div className="mt-4">
          <InfoNote>
            Reviewing means opening the record, checking the details against a source you trust, and
            recording a decision. A rejection needs a reason — it is shown to whoever submitted the
            record, and &ldquo;rejected&rdquo; with no explanation becomes a support ticket.
          </InfoNote>
        </div>

        {canActOnThisTab && kind === "colleges" && (
          <BulkBar
            action={bulkCollegeAction}
            entityLabel="college"
            entityLabelPlural="colleges"
            actions={[
              { key: "verify", label: "Verify" },
              {
                key: "reject",
                label: "Reject",
                destructive: true,
                confirmBody:
                  "Bulk rejection records no reason against any of these records. Prefer rejecting individually, where you can say what is wrong.",
              },
            ]}
          />
        )}

        {canActOnThisTab && kind === "students" && (
          <BulkBar
            action={bulkStudentAction}
            entityLabel="student"
            entityLabelPlural="students"
            actions={[{ key: "verify", label: "Mark verified" }]}
          />
        )}
      </SelectionScope>
    </div>
  );
}
