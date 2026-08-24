import type { Metadata } from "next";
import { connectDB } from "@/lib/db";
import { AlertIcon } from "@/components/icons";
import { SeverityBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/admin/format";
import { ErrorLog } from "@/models/SystemModels";

export const metadata: Metadata = { title: "Error logs" };

export default async function ErrorLogsPage() {
  await requirePermission("system.view", "/admin/system/errors");

  await connectDB();
  const errors = await ErrorLog.find({}).sort({ lastSeenAt: -1 }).limit(100).lean();

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title="Error logs"
        description="Application errors, grouped by message. The count is how often each has happened."
        breadcrumbs={[{ label: "System" }, { label: "Error Logs" }]}
        meta={<Badge tone={errors.length > 0 ? "warning" : "success"}>{errors.length} groups</Badge>}
      />

      <Card padded={false}>
        {errors.length === 0 ? (
          <EmptyState
            icon={<AlertIcon className="h-5 w-5" />}
            title="Nothing logged"
            description="No errors have been recorded in the retention window."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {errors.map((error) => (
              <li key={String(error._id)} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={error.level} />
                  <Badge tone="neutral">{error.source}</Badge>
                  <span className="text-[11.5px] tabular-nums text-slate-400">
                    ×{formatNumber(error.occurrences)}
                  </span>
                  {error.resolvedAt && <Badge tone="success">Resolved</Badge>}
                  <span
                    className="ml-auto shrink-0 text-[11.5px] text-slate-400"
                    title={formatDateTime(error.lastSeenAt)}
                  >
                    last seen {formatRelative(error.lastSeenAt)}
                  </span>
                </div>

                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">
                  {error.message}
                </p>

                <p className="mt-1 text-[11.5px] text-slate-400">
                  First seen {formatRelative(error.createdAt)}
                  {error.fingerprint && (
                    <span className="ml-2 font-mono">{error.fingerprint}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4">
        <InfoNote>
          Stack traces are stored but never rendered here — they name internal paths and sometimes
          carry values from the request that failed. They belong in the operator&apos;s log
          aggregator, not on a page an administrator can screenshot. Rows are kept for 90 days.
        </InfoNote>
      </div>
    </div>
  );
}
