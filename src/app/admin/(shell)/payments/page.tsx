import type { Metadata } from "next";
import { Cell, Column, DataTable, PrimaryCell, Row } from "@/components/admin/data-table";
import { Badge, Card, EmptyState, PageHeader, type BadgeTone } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatRelative } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { listLedger } from "@/lib/payments/admin";
import {
  formatPaise,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
} from "@/lib/payments/fields";
import { isPaymentsConfigured, isWebhookConfigured, mode } from "@/lib/payments/razorpay";

export const metadata: Metadata = { title: "Payments" };

const BASE = "/admin/payments";

const COLUMNS: Column[] = [
  { key: "student", label: "Student" },
  { key: "description", label: "Description", secondary: true },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount", numeric: true },
  { key: "balance", label: "Balance after", numeric: true, secondary: true },
  { key: "when", label: "When", secondary: true },
];

const TABS = [{ key: "all", label: "All" }, ...TRANSACTION_TYPES.map((type) => ({
  key: type,
  label: TRANSACTION_TYPE_LABELS[type],
}))];

/**
 * The payments ledger.
 *
 * Read-only on purpose. Refunds go through `POST /api/admin/payments/refund`,
 * which needs its own permission, and there is deliberately no button here that
 * moves money — a table an administrator scans is the wrong surface for an
 * irreversible action sitting one misclick away from a row.
 *
 * The header states the **mode and the webhook**, because those are the two
 * configuration facts that silently decide whether money is real and whether it
 * arrives. A deployment taking live payments with no webhook configured looks
 * completely healthy until a student closes their tab mid-payment.
 */
export default async function PaymentsPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("payment.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const type = typeof params.type === "string" ? params.type : "all";
  const search = typeof params.q === "string" ? params.q : "";

  const { rows, total, totals } = await listLedger({
    type: type === "all" ? null : type,
    search,
    limit: 50,
  });

  const live = mode() === "live";
  const configured = isPaymentsConfigured();

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every movement across every student wallet. The ledger is append-only — a correction is another row, never an edit."
        breadcrumbs={[{ label: "Operations" }, { label: "Payments" }]}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            {!configured ? (
              <Badge tone="neutral">Razorpay not configured</Badge>
            ) : (
              <Badge tone={live ? "success" : "warning"}>{live ? "Live mode" : "Test mode"}</Badge>
            )}
            {configured && !isWebhookConfigured() && (
              /**
               * The one misconfiguration that loses money silently.
               *
               * Without a webhook secret the only settlement path is the
               * browser callback, so any student who closes their tab before it
               * fires has paid and not been credited — and nothing anywhere
               * reports it.
               */
              <Badge tone="danger">No webhook secret — credits can be missed</Badge>
            )}
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Money in" value={formatPaise(totals.creditedPaise)} />
        <Stat label="Money out" value={formatPaise(totals.debitedPaise)} />
        <Stat label="Entries" value={total.toLocaleString("en-IN")} />
      </div>

      <Card
        title="Ledger"
        description="Newest first. Filter by kind, or search by student name or email."
        actions={
          <form action={BASE} className="flex items-center gap-2">
            <input type="hidden" name="type" value={type} />
            <label htmlFor="payment-search" className="sr-only">
              Search payments
            </label>
            <input
              id="payment-search"
              name="q"
              defaultValue={search}
              placeholder="Student name or email"
              className="w-56 rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </form>
        }
      >
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5 px-4 pb-3">
          {TABS.map((tab) => {
            const active = tab.key === type;
            return (
              <a
                key={tab.key}
                href={`${BASE}?type=${tab.key}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium transition ${
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>

        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={params}
          rowCount={rows.length}
          empty={
            <EmptyState
              title={search ? "Nothing matches that search" : "No transactions yet"}
              description={
                configured
                  ? "Money students add, and payments they make, appear here."
                  : "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to start taking payments."
              }
            />
          }
        >
          {rows.map((row) => (
            <Row key={row.id}>
              <PrimaryCell title={row.studentName ?? "Unknown"} subtitle={row.studentEmail ?? ""} />
              <Cell secondary muted>
                {row.description}
                {row.reason ? ` — ${row.reason}` : ""}
              </Cell>
              <Cell>
                <Badge tone={toneFor(row.type, row.status)}>
                  {TRANSACTION_TYPE_LABELS[row.type]}
                  {row.status === "failed" ? " (failed)" : ""}
                </Badge>
              </Cell>
              <Cell numeric>
                <span
                  className={
                    row.status === "failed"
                      ? "text-slate-400 line-through dark:text-slate-600"
                      : row.amountPaise > 0
                        ? "font-semibold text-emerald-600 dark:text-emerald-400"
                        : "font-semibold"
                  }
                >
                  {row.amountPaise > 0 ? "+" : ""}
                  {formatPaise(row.amountPaise)}
                </span>
              </Cell>
              <Cell numeric secondary muted>
                {row.balanceAfterPaise === null ? "—" : formatPaise(row.balanceAfterPaise)}
              </Cell>
              <Cell secondary muted>
                {formatRelative(row.createdAt)}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Card>
    </>
  );
}

function toneFor(type: TransactionType, status: string): BadgeTone {
  if (status === "failed") return "neutral";
  if (type === "topup" || type === "reversal") return "success";
  if (type === "refund") return "warning";
  if (type === "adjustment") return "info";
  return "neutral";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[12px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
