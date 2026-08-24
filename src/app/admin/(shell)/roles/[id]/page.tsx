import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleEditor } from "@/components/admin/role-editor";
import { AdminStatusBadge } from "@/components/admin/status";
import { Badge, BUTTON_STYLES, Card, InfoNote, PageHeader } from "@/components/admin/ui";
import { deleteRoleAction } from "@/lib/admin/actions/administration";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { SUPER_ADMIN_PERMISSION } from "@/lib/admin/permissions";
import { getRole } from "@/lib/admin/data/administration";

type Params = Promise<{ id: string }>;

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { id } = await props.params;
  if (id === "new") return { title: "New role" };
  const role = await getRole(id);
  return { title: role?.name ?? "Role" };
}

export default async function RoleDetailPage(props: { params: Params }) {
  const { id } = await props.params;
  const admin = await requirePermission("admin.view", `/admin/roles/${id}`);

  const creating = id === "new";
  if (creating) await requirePermission("admin.manage_roles", "/admin/roles/new");

  const role = creating ? null : await getRole(id);
  if (!creating && !role) notFound();

  const editable = can(admin, "admin.manage_roles");
  const canGrantWildcard = admin.permissions.includes(SUPER_ADMIN_PERMISSION);

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        breadcrumbs={[
          { label: "Administration" },
          { label: "Roles & Permissions", href: "/admin/roles" },
          { label: creating ? "New role" : role!.name },
        ]}
        title={creating ? "New role" : role!.name}
        description={
          creating
            ? "A role is a bundle of permissions. Nothing in the admin app checks a role by name, so you can create whatever fits the job."
            : (role!.description ?? undefined)
        }
        meta={
          !creating ? (
            <>
              {role!.system ? <Badge tone="neutral">Built in</Badge> : <Badge tone="purple">Custom</Badge>}
              <Badge tone="info">
                {role!.admins.length} {role!.admins.length === 1 ? "admin" : "admins"}
              </Badge>
            </>
          ) : undefined
        }
      />

      {!creating && role!.system && editable && (
        <div className="mb-4">
          <InfoNote>
            This is a built-in role. It can be edited — an operator who wants Support Admin to stop
            seeing phone numbers should be able to say so — but it cannot be deleted.
          </InfoNote>
        </div>
      )}

      {editable ? (
        <RoleEditor
          role={{
            id: creating ? undefined : role!.id,
            name: creating ? "" : role!.name,
            description: creating ? "" : (role!.description ?? ""),
            permissions: creating ? [] : role!.permissions,
            system: creating ? false : role!.system,
          }}
          canGrantWildcard={canGrantWildcard}
        />
      ) : (
        <Card title="Permissions">
          {role!.permissions.includes(SUPER_ADMIN_PERMISSION) ? (
            <p className="text-[13px] text-slate-600 dark:text-slate-300">
              Unrestricted — everything, including modules added later.
            </p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {role!.permissions.map((permission) => (
                <li key={permission} className="font-mono text-[12px] text-slate-600 dark:text-slate-300">
                  {permission}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!creating && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card title="Who holds this role" padded={false}>
            {role!.admins.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-slate-400">
                Nobody has this role.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {role!.admins.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-2 px-4 py-2"
                  >
                    <Link
                      href={`/admin/team/${entry.id}`}
                      className="min-w-0 flex-1 truncate text-[13px] text-slate-800 hover:underline dark:text-slate-100"
                    >
                      {entry.name}
                    </Link>
                    <AdminStatusBadge status={entry.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {editable && !role!.system && (
            <Card title="Delete this role">
              {role!.admins.length > 0 ? (
                <p className="text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {role!.admins.length} {role!.admins.length === 1 ? "person holds" : "people hold"}{" "}
                  this role. Move them to another role first — deleting it would leave them able to
                  open nothing, with no explanation of why.
                </p>
              ) : (
                <form action={deleteRoleAction}>
                  <input type="hidden" name="id" value={role!.id} />
                  <p className="mb-2 text-[12.5px] text-slate-500 dark:text-slate-400">
                    Nobody holds this role, so deleting it affects no one.
                  </p>
                  <button type="submit" className={`${BUTTON_STYLES.danger} w-full`}>
                    Delete role
                  </button>
                </form>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
