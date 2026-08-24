import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyIcon, ShieldIcon } from "@/components/admin/icons";
import { AdminStatusBadge, SeverityBadge } from "@/components/admin/status";
import {
  Badge,
  BUTTON_STYLES,
  Card,
  Field,
  FieldGrid,
  InfoNote,
  PageHeader,
} from "@/components/admin/ui";
import {
  changeAdminRoleAction,
  resetAdminPasswordAction,
  setAdminStatusAction,
} from "@/lib/admin/actions/administration";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatDate, formatDateTime, formatRelative, initials } from "@/lib/admin/format";
import { permissionLabel } from "@/lib/admin/permissions";
import { readParam, type SearchParams } from "@/lib/admin/query";
import { getAdminDetail, listRoles } from "@/lib/admin/data/administration";

type Params = Promise<{ id: string }>;

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { id } = await props.params;
  const detail = await getAdminDetail(id);
  return { title: detail?.name ?? "Administrator" };
}

const OUTCOMES: Record<string, string> = {
  success: "Signed in",
  "bad-password": "Wrong password",
  "unknown-account": "No such account",
  locked: "Locked out",
  inactive: "Inactive account",
  logout: "Signed out",
};

export default async function AdminDetailPage(props: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await props.params;
  const viewer = await requirePermission("admin.view", `/admin/team/${id}`);
  const params = await props.searchParams;

  const [target, roles] = await Promise.all([getAdminDetail(id), listRoles()]);
  if (!target) notFound();

  const newPassword = readParam(params, "password");
  const isSelf = target.id === viewer.id;

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        breadcrumbs={[
          { label: "Administration" },
          { label: "Admin Users", href: "/admin/team" },
          { label: target.name },
        ]}
        title={
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-800 text-[12px] font-semibold text-white dark:bg-slate-700">
              {initials(target.name)}
            </span>
            {target.name}
          </span>
        }
        description={target.email}
        meta={
          <>
            <AdminStatusBadge status={target.status} />
            {target.twoFactorEnabled ? (
              <Badge tone="success">2FA on</Badge>
            ) : (
              <Badge tone="warning">2FA off</Badge>
            )}
            {isSelf && <Badge tone="info">This is you</Badge>}
          </>
        }
      />

      {newPassword && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
            New password generated
          </p>
          <p className="mt-1 font-mono text-[15px] font-medium text-amber-900 dark:text-amber-100">
            {newPassword}
          </p>
          <p className="mt-1 text-[12px] text-amber-800 dark:text-amber-300">
            Shown once. Pass it on out of band — it is not stored anywhere readable and is not in
            the audit log.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Card title="Account">
            <FieldGrid>
              <Field label="Name" value={target.name} />
              <Field label="Email" value={target.email} />
              <Field label="Team" value={target.team} />
              <Field label="Job title" value={target.title} />
              <Field label="Added" value={formatDate(target.createdAt)} />
              <Field label="Invited" value={formatDate(target.invitedAt)} />
              <Field
                label="Last sign-in"
                value={target.lastLoginAt ? formatDateTime(target.lastLoginAt) : "Never"}
              />
              <Field label="From" value={target.lastLoginIp} />
              <Field label="Deactivated" value={formatDate(target.deactivatedAt)} />
            </FieldGrid>
          </Card>

          <Card
            title="What this account can do"
            description={
              target.role
                ? `Through the ${target.role.name} role${target.extraPermissions.length || target.deniedPermissions.length ? ", plus per-account overrides" : ""}.`
                : "No role is assigned — this account can do nothing."
            }
          >
            {target.role ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/roles/${target.role.id}`}
                    className="text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {target.role.name}
                  </Link>
                  <Badge tone="neutral">
                    {target.role.permissions.includes("*")
                      ? "Unrestricted"
                      : `${target.role.permissions.length} permissions`}
                  </Badge>
                </div>
                {target.role.description && (
                  <p className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">
                    {target.role.description}
                  </p>
                )}

                {target.extraPermissions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-emerald-600 dark:text-emerald-400">
                      Granted on top of the role
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {target.extraPermissions.map((permission) => (
                        <li
                          key={permission}
                          className="text-[12.5px] text-slate-700 dark:text-slate-200"
                        >
                          · {permissionLabel(permission)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {target.deniedPermissions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-rose-600 dark:text-rose-400">
                      Denied, whatever the role grants
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {target.deniedPermissions.map((permission) => (
                        <li
                          key={permission}
                          className="text-[12.5px] text-slate-700 dark:text-slate-200"
                        >
                          · {permissionLabel(permission)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                No role. This account cannot open any admin screen.
              </p>
            )}
          </Card>

          <Card
            title="Recent actions"
            description="What this administrator has done."
            padded={false}
            actions={
              <Link
                href={`/admin/audit?actor=${target.id}`}
                className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Full audit
              </Link>
            }
          >
            {target.recentActions.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-slate-400">
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {target.recentActions.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <span className="font-mono text-[12px] text-slate-500 dark:text-slate-400">
                      {entry.action}
                    </span>
                    {entry.entityLabel && (
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700 dark:text-slate-200">
                        {entry.entityLabel}
                      </span>
                    )}
                    {entry.severity === "critical" && <SeverityBadge severity="critical" />}
                    <span className="ml-auto shrink-0 text-[11.5px] text-slate-400">
                      {formatRelative(entry.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Sign-in history" padded={false}>
            {target.logins.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-slate-400">
                No sign-in attempts recorded.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {target.logins.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <Badge tone={entry.outcome === "success" ? "success" : "danger"}>
                      {OUTCOMES[entry.outcome] ?? entry.outcome}
                    </Badge>
                    {entry.ip && (
                      <span className="font-mono text-[11.5px] text-slate-400">{entry.ip}</span>
                    )}
                    <span className="ml-auto shrink-0 text-[11.5px] text-slate-400">
                      {formatRelative(entry.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          {can(viewer, "admin.edit") && !isSelf && (
            <Card title="Change role">
              <form action={changeAdminRoleAction} className="space-y-2">
                <input type="hidden" name="id" value={target.id} />
                <select
                  name="roleId"
                  defaultValue={target.role?.id ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={`${BUTTON_STYLES.primary} w-full`}>
                  <KeyIcon className="h-3.5 w-3.5" />
                  Apply
                </button>
              </form>
            </Card>
          )}

          {can(viewer, "admin.deactivate") && !isSelf && (
            <Card title="Access">
              <div className="space-y-2">
                {target.status !== "active" && (
                  <StatusButton id={target.id} status="active" label="Reinstate" />
                )}
                {target.status === "active" && (
                  <>
                    <StatusButton id={target.id} status="suspended" label="Suspend" />
                    <StatusButton id={target.id} status="deactivated" label="Deactivate" danger />
                  </>
                )}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                A suspended or deactivated account is refused at the next request, not when its
                session expires — permissions are resolved per request.
              </p>
            </Card>
          )}

          {can(viewer, "admin.edit") && (
            <Card title="Password">
              <form action={resetAdminPasswordAction}>
                <input type="hidden" name="id" value={target.id} />
                <button type="submit" className={`${BUTTON_STYLES.secondary} w-full`}>
                  <ShieldIcon className="h-3.5 w-3.5" />
                  Generate a new password
                </button>
              </form>
              <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                Shown once on this page. There is no admin email path yet, so it is handed over
                rather than sent — inventing a mail flow that silently did nothing would be worse.
              </p>
            </Card>
          )}

          {isSelf && (
            <InfoNote>
              You cannot change your own role or access from here. Locking yourself out is the one
              irreversible mistake on this screen.
            </InfoNote>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  danger,
}: {
  id: string;
  status: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <form action={setAdminStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`${danger ? BUTTON_STYLES.danger : BUTTON_STYLES.secondary} w-full`}
      >
        {label}
      </button>
    </form>
  );
}
