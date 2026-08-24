import type { Metadata } from "next";
import Link from "next/link";
import { UsersIcon } from "@/components/icons";
import { InviteAdminForm } from "@/components/admin/invite-admin-form";
import { Cell, Column, DataTable, PrimaryCell, Row, TableFooter } from "@/components/admin/data-table";
import { AdminStatusBadge } from "@/components/admin/status";
import { TableToolbar, type FilterGroup } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatDate, formatNumber, formatRelative } from "@/lib/admin/format";
import { readParam, type SearchParams } from "@/lib/admin/query";
import { listAdmins, listRoles } from "@/lib/admin/data/administration";

export const metadata: Metadata = { title: "Admin users" };

const BASE = "/admin/team";

const COLUMNS: Column[] = [
  { key: "name", label: "Administrator" },
  { key: "role", label: "Role" },
  { key: "team", label: "Team", secondary: true },
  { key: "status", label: "Status" },
  { key: "twofa", label: "2FA" },
  { key: "overrides", label: "Overrides", numeric: true, secondary: true },
  { key: "lastLogin", label: "Last sign-in" },
  { key: "created", label: "Added", secondary: true },
];

/**
 * Administrator accounts (spec §28).
 *
 * The role column is a link to the role, not a dropdown: changing what someone
 * can do is a decision that belongs on a screen showing what the role grants,
 * not a two-click affordance in a table.
 */
export default async function AdminTeamPage(props: PageProps<"/admin/team">) {
  const admin = await requirePermission("admin.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const [{ rows, total, page, limit }, roles] = await Promise.all([
    listAdmins(params),
    listRoles(),
  ]);

  const justInvited = readParam(params, "invited") === "1";

  const filters: FilterGroup[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "invited", label: "Invited" },
        { value: "suspended", label: "Suspended" },
        { value: "deactivated", label: "Deactivated" },
      ],
    },
    {
      key: "role",
      label: "Role",
      options: roles.map((role) => ({ value: role.id, label: role.name, count: role.adminCount })),
    },
  ];

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Admin users"
        description="Who has administrative access, what their role grants, and when they last signed in."
        breadcrumbs={[{ label: "Administration" }, { label: "Admin Users" }]}
        meta={<Badge tone="neutral">{formatNumber(total)} accounts</Badge>}
        actions={
          <Link
            href="/admin/roles"
            className="rounded-lg border border-slate-200 px-3 py-[7px] text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Roles & permissions
          </Link>
        }
      />

      {justInvited && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          Invitation created. The account appears below as <strong>Invited</strong> until they set a
          password.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Card padded={false}>
            <TableToolbar
              basePath={BASE}
              params={params}
              searchPlaceholder="Search by name, email or team…"
              filters={filters}
              filterKeys={["status", "role"]}
            />

            <DataTable
              columns={COLUMNS}
              basePath={BASE}
              params={params}
              rowCount={rows.length}
              empty={
                <EmptyState
                  icon={<UsersIcon className="h-5 w-5" />}
                  title="No administrators match"
                  description="Try clearing the status or role filter."
                />
              }
            >
              {rows.map((row) => (
                <Row key={row.id} highlighted={row.status === "invited"}>
                  <PrimaryCell
                    href={`${BASE}/${row.id}`}
                    title={row.name}
                    subtitle={row.email}
                  />
                  <Cell nowrap>
                    <Link
                      href={`/admin/roles/${row.roleId}`}
                      className="text-[12.5px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {row.roleName}
                    </Link>
                  </Cell>
                  <Cell secondary muted nowrap>
                    {row.team ?? "—"}
                  </Cell>
                  <Cell nowrap>
                    <AdminStatusBadge status={row.status} />
                  </Cell>
                  <Cell nowrap>
                    {row.twoFactorEnabled ? (
                      <Badge tone="success">On</Badge>
                    ) : (
                      <Badge tone="warning">Off</Badge>
                    )}
                  </Cell>
                  <Cell secondary numeric muted>
                    {row.overrides > 0 ? row.overrides : "—"}
                  </Cell>
                  <Cell muted nowrap>
                    {row.lastLoginAt ? formatRelative(row.lastLoginAt) : "Never"}
                  </Cell>
                  <Cell secondary muted nowrap>
                    {formatDate(row.createdAt)}
                  </Cell>
                </Row>
              ))}
            </DataTable>

            <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
          </Card>
        </div>

        <aside className="space-y-4">
          {can(admin, "admin.invite") ? (
            <InviteAdminForm
              roles={roles.map((role) => ({
                id: role.id,
                name: role.name,
                description: role.description,
                permissionCount: role.permissions.includes("*") ? -1 : role.permissions.length,
              }))}
            />
          ) : (
            <Card title="Invite an administrator">
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                Your role does not include inviting administrators.
              </p>
            </Card>
          )}

          <InfoNote>
            Nobody is a Super Admin by default. Give each person the narrowest role that covers
            their work — a role can always be widened, and the audit log records who widened it.
          </InfoNote>
        </aside>
      </div>
    </div>
  );
}
