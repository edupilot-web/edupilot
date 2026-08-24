import type { Metadata } from "next";
import Link from "next/link";
import { ShieldIcon } from "@/components/admin/icons";
import { Badge, Card, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatDateTime, formatRelative } from "@/lib/admin/format";
import { getSecurityOverview } from "@/lib/admin/data/administration";

export const metadata: Metadata = { title: "Security" };

const OUTCOMES: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  success: { label: "Signed in", tone: "success" },
  "bad-password": { label: "Wrong password", tone: "danger" },
  "unknown-account": { label: "No such account", tone: "danger" },
  locked: { label: "Locked out", tone: "warning" },
  inactive: { label: "Inactive account", tone: "warning" },
  logout: { label: "Signed out", tone: "neutral" },
};

/**
 * Sign-in history and account security (spec §43).
 *
 * Failed attempts against addresses that have no account are called out
 * separately: a wrong password is usually someone's memory, but repeated
 * attempts on addresses that do not exist is someone guessing who the
 * administrators are.
 */
export default async function SecurityPage() {
  await requirePermission("audit.view", "/admin/security");

  const overview = await getSecurityOverview();

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Security"
        description="Administrator sign-ins, failed attempts and the accounts that are exposed."
        breadcrumbs={[{ label: "Administration" }, { label: "Security" }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Failed attempts (24h)"
          value={overview.failedToday}
          hint={overview.failedToday > 10 ? "Higher than usual" : "Within normal range"}
          tone={overview.failedToday > 10 ? "warning" : undefined}
        />
        <StatCard
          label="Locked accounts"
          value={overview.lockedAccounts}
          hint={overview.lockedAccounts > 0 ? "Unlock from the admin's page" : "None"}
          tone={overview.lockedAccounts > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Active administrators"
          value={overview.activeAdmins}
          hint="Accounts that can sign in"
        />
        <StatCard
          label="Without 2FA"
          value={overview.without2fa}
          hint={overview.without2fa > 0 ? "Each is a single password away" : "All protected"}
          tone={overview.without2fa > 0 ? "warning" : undefined}
        />
      </div>

      {overview.suspicious.length > 0 && (
        <div className="mb-4">
          <Card
            title="Addresses worth a look"
            description="Repeated failures from one origin in the recent window."
            padded={false}
          >
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {overview.suspicious.map((entry) => (
                <li
                  key={entry.ip}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className="font-mono text-[13px] text-slate-800 dark:text-slate-100">
                    {entry.ip}
                  </span>
                  <span className="text-[12.5px] text-slate-500 dark:text-slate-400">
                    {entry.attempts} failed attempts against {entry.addresses}{" "}
                    {entry.addresses === 1 ? "address" : "addresses"}
                  </span>
                  <Badge tone={entry.addresses > 1 ? "danger" : "warning"}>
                    {entry.addresses > 1 ? "Probing" : "Repeated"}
                  </Badge>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <InfoNote>
                Origins are read from <code className="font-mono">x-forwarded-for</code>, which the
                caller can set unless a proxy overwrites it. Treat this as a signal worth
                investigating, not as proof of where the traffic came from.
              </InfoNote>
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card title="Recent sign-in activity" padded={false}>
          {overview.events.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-400">
              Nothing recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {overview.events.map((event) => {
                const outcome = OUTCOMES[event.outcome] ?? { label: event.outcome, tone: "neutral" as const };
                return (
                  <li key={event.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <Badge tone={outcome.tone}>{outcome.label}</Badge>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700 dark:text-slate-200">
                      {event.email}
                    </span>
                    {event.ip && (
                      <span className="shrink-0 font-mono text-[11.5px] text-slate-400">
                        {event.ip}
                      </span>
                    )}
                    <span
                      className="shrink-0 text-[11.5px] text-slate-400"
                      title={formatDateTime(event.at)}
                    >
                      {formatRelative(event.at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <aside className="space-y-4">
          <Card title="How admin sessions work">
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
              <li>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Separate from student sessions.
                </strong>{" "}
                A different cookie, a different claim, scoped to <code className="font-mono">/admin</code>.
                A student session cannot become an admin one.
              </li>
              <li>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Eight hours, two-hour idle timeout.
                </strong>{" "}
                A laptop left open overnight is not a standing key.
              </li>
              <li>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Permissions resolved per request.
                </strong>{" "}
                Revoking one takes effect immediately, not when the token expires.
              </li>
              <li>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Lockout after eight failures.
                </strong>{" "}
                For thirty minutes, and rate limited per account and per origin before that.
              </li>
            </ul>
          </Card>

          <Card title="Not built yet">
            <p className="text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              Two-factor enrolment is stored on the account but there is no enrolment flow, so the
              flag reflects seed data rather than a real second factor. Session revocation needs a
              token version or a session store — the tokens are stateless today, so signing someone
              out everywhere is not yet possible.
            </p>
            <Link
              href="/admin/audit?severity=critical"
              className="mt-3 inline-block text-[12.5px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Review critical actions →
            </Link>
          </Card>

          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
            <ShieldIcon className="mt-px h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
              Sign-in events are kept for 180 days and then removed automatically.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
