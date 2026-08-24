import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { KeyIcon } from "@/components/admin/icons";
import { Badge, BUTTON_STYLES, Card, InfoNote, PageHeader } from "@/components/admin/ui";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { PERMISSION_MODULES } from "@/lib/admin/permissions";
import { readParam, type SearchParams } from "@/lib/admin/query";
import { listRoles } from "@/lib/admin/data/administration";

export const metadata: Metadata = { title: "Roles & permissions" };

/**
 * Roles and what each grants (spec §26–§27).
 *
 * The grid is the point: a table of role names tells an operator nothing, and
 * "which roles can verify a college?" is answered by reading down a column
 * rather than by opening nine role pages.
 */
export default async function RolesPage(props: PageProps<"/admin/roles">) {
  const admin = await requirePermission("admin.view", "/admin/roles");
  const params = (await props.searchParams) as SearchParams;

  const roles = await listRoles();
  const justSaved = readParam(params, "saved") === "1";

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Roles & permissions"
        description="Roles are bundles of permissions, and they are data — nothing in the admin app checks a role by name."
        breadcrumbs={[{ label: "Administration" }, { label: "Roles & Permissions" }]}
        meta={<Badge tone="neutral">{roles.length} roles</Badge>}
        actions={
          can(admin, "admin.manage_roles") ? (
            <Link href="/admin/roles/new" className={BUTTON_STYLES.primary}>
              <KeyIcon className="h-3.5 w-3.5" />
              New role
            </Link>
          ) : undefined
        }
      />

      {justSaved && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          Role saved. Anyone holding it picks up the change on their next request — permissions are
          resolved per request, not baked into the session.
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <Link
            key={role.id}
            href={`/admin/roles/${role.id}`}
            className="rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[14px] font-semibold text-slate-900 dark:text-white">
                {role.name}
              </span>
              {role.system ? (
                <Badge tone="neutral">Built in</Badge>
              ) : (
                <Badge tone="purple">Custom</Badge>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              {role.description ?? "No description."}
            </p>
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <span className="text-slate-500 dark:text-slate-400">
                {role.permissions.includes("*")
                  ? "Unrestricted"
                  : `${role.permissions.length} permissions`}
              </span>
              <span className="tabular-nums text-slate-400">
                {role.adminCount} {role.adminCount === 1 ? "admin" : "admins"}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <Card
        title="Permission grid"
        description="What each role grants. A dot means the role includes that action."
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm dark:bg-slate-900/95">
                <th className="border-b border-slate-200 px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:border-slate-700">
                  Permission
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="border-b border-slate-200 px-2 py-2 text-center text-[11px] font-semibold text-slate-500 dark:border-slate-700"
                  >
                    {/* Rotated headings would be unreadable at this width; the
                        short name plus a title attribute is more legible. */}
                    <span title={role.name}>{shortName(role.name)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {PERMISSION_MODULES.map((entry) => (
                // A keyed Fragment, not a bare `<>`: the group heading and its
                // action rows are siblings in one list and React needs the key
                // on whatever wraps them.
                <Fragment key={entry.key}>
                  <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                    <td
                      colSpan={roles.length + 1}
                      className="px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-500"
                    >
                      {entry.label}
                    </td>
                  </tr>
                  {entry.actions.map((action) => {
                    const permission = `${entry.key}.${action.key}`;
                    return (
                      <tr key={permission} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-1.5">
                          <span className="text-[12.5px] text-slate-700 dark:text-slate-200">
                            {action.label}
                          </span>
                          <span className="ml-2 text-[11.5px] text-slate-400">
                            {action.description}
                          </span>
                        </td>
                        {roles.map((role) => {
                          const granted =
                            role.permissions.includes("*") ||
                            role.permissions.includes(permission) ||
                            role.permissions.includes(`${entry.key}.*`);
                          return (
                            <td key={role.id} className="px-2 py-1.5 text-center">
                              {granted ? (
                                <span
                                  aria-label={`${role.name} can ${action.label.toLowerCase()}`}
                                  className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                                />
                              ) : (
                                <span
                                  aria-label={`${role.name} cannot ${action.label.toLowerCase()}`}
                                  className="inline-block h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700"
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <InfoNote>
          <strong>Deny wins.</strong> An administrator can be granted extra permissions or denied
          specific ones on top of their role — a denial recorded against one person cannot be undone
          by someone editing the shared role. Only a Super Admin can grant unrestricted access.
        </InfoNote>
      </div>
    </div>
  );
}

/** "Institution Admin" → "Institution". Full name stays in the title attribute. */
function shortName(name: string): string {
  return name.replace(/\s*Admin(istrator)?$/i, "") || name;
}
