import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { ServiceRequestWorkbench } from "@/components/admin/service-request-workbench";
import { requirePermission } from "@/lib/admin/current-admin";
import { hasPermission } from "@/lib/admin/permissions";
import { getForAdmin } from "@/lib/service-requests/admin";

export const metadata: Metadata = { title: "Service request" };

const BASE = "/admin/service-requests";

/**
 * One request, worked.
 *
 * The desk sees **everything**, internal notes included — that is the whole
 * point of having them. The student's view of the same row filters them out in
 * the query, so the two screens read the same collection and disagree only where
 * they are meant to.
 */
export default async function Page(props: PageProps<"/admin/service-requests/[id]">) {
  const admin = await requirePermission("service_request.view", BASE);
  const { id } = await props.params;

  const request = await getForAdmin({ id: admin.id, collegeId: admin.collegeId }, id);

  /**
   * A 404 for "outside your college" as well as "does not exist".
   *
   * `getForAdmin` scopes on `collegeId` inside the query, so a campus admin
   * probing an id from another institution gets the same answer as for a real
   * miss.
   */
  if (!request) notFound();

  const canHandle = hasPermission(admin.permissions, "service_request.handle");

  return (
    <>
      <PageHeader
        title={request.subject}
        description={`${request.ticket} · ${request.categoryLabel} · ${request.typeLabel}`}
        breadcrumbs={[
          { label: "Operations" },
          { label: "Service requests", href: BASE },
          { label: request.ticket },
        ]}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={request.overdue ? "danger" : "info"}>{request.statusLabel}</Badge>
            {request.overdue && <Badge tone="danger">Overdue</Badge>}
            {request.priority !== "normal" && (
              <Badge tone="warning">{request.priority} priority</Badge>
            )}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="What they asked for">
            <div className="space-y-3 px-4 py-3">
              <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                <Detail label="Student" value={request.studentName ?? "Unknown"} />
                <Detail label="Email" value={request.studentEmail ?? "—"} />
                <Detail label="College" value={request.collegeName ?? "—"} />
                <Detail
                  label="Target"
                  value={request.targetAt ? formatDate(request.targetAt) : "—"}
                />
              </dl>

              <p className="whitespace-pre-wrap border-t border-slate-100 pt-3 text-[13.5px] leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-200">
                {request.description}
              </p>

              {request.attachments.length > 0 && (
                <ul className="space-y-1">
                  {request.attachments.map((file) => (
                    <li key={file.fileId}>
                      <a
                        href={`/api/files/${file.fileId}`}
                        className="text-[13px] font-medium text-blue-700 underline dark:text-blue-400"
                      >
                        {file.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card title="History">
            <ol className="space-y-3 px-4 py-3">
              {request.timeline.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      entry.internal
                        ? "bg-amber-400"
                        : entry.actorKind === "staff"
                          ? "bg-blue-600"
                          : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-slate-400 dark:text-slate-500">
                      {entry.actorName ?? entry.actorKind} · {formatDateTime(entry.createdAt)}
                      {entry.internal && (
                        /* Marked, so a clerk can see at a glance what the
                           student has and has not been told. */
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                          internal
                        </span>
                      )}
                    </p>
                    {entry.body ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200">
                        {entry.body}
                      </p>
                    ) : entry.toValue ? (
                      <p className="mt-0.5 text-[13.5px] text-slate-700 dark:text-slate-200">
                        {entry.kind === "assigned" ? "Taken by " : "Moved to "}
                        <strong>{entry.toValue.replace(/_/g, " ")}</strong>
                      </p>
                    ) : null}
                    {entry.attachments.map((file) => (
                      <a
                        key={file.fileId}
                        href={`/api/files/${file.fileId}`}
                        className="mt-1 block text-[12.5px] font-medium text-blue-700 underline dark:text-blue-400"
                      >
                        {file.fileName}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Work it">
            <div className="px-4 py-3">
              <ServiceRequestWorkbench
                requestId={request.id}
                status={request.status}
                priority={request.priority}
                assignedToName={request.assignedToName}
                nextStatuses={request.nextStatuses}
                canHandle={canHandle}
              />
            </div>
          </Card>

          {request.resolution && (
            <Card title="Outcome">
              <p className="whitespace-pre-wrap px-4 py-3 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200">
                {request.resolution}
              </p>
            </Card>
          )}

          <p className="px-1 text-[12.5px] text-slate-400 dark:text-slate-500">
            <Link href={BASE} className="underline">
              Back to the queue
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
