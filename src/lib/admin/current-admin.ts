import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { hasAnyPermission, hasPermission } from "@/lib/admin/permissions";
import { AdminUser } from "@/models/AdminUser";
import { Role } from "@/models/Role";

export type CurrentAdmin = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  team: string | null;
  title: string | null;
  avatarUrl: string | null;
  /** The role's grants, plus per-account extras, minus per-account denials. */
  permissions: string[];
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
};

/**
 * The signed-in administrator, with permissions already resolved.
 *
 * Wrapped in React's `cache`, so the layout, the sidebar and the page inside
 * them share one pair of queries per request rather than each making their own.
 *
 * Permissions are resolved **on every request**, from the role document — not
 * baked into the session token. A token that carried its grants would keep them
 * until it expired, so revoking a permission would take up to eight hours to
 * take effect. That is the wrong trade for an admin application: one extra
 * indexed read per request buys immediate revocation.
 */
export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const session = await getAdminSession();
  if (!session) return null;

  await connectDB();
  const admin = await AdminUser.findById(session.sub)
    .select("name email roleId roleName team title avatarUrl extraPermissions deniedPermissions status twoFactorEnabled lastLoginAt")
    .lean();

  // The cookie outlived the account, or the account was suspended mid-session.
  if (!admin || admin.status !== "active") return null;

  const role = await Role.findById(admin.roleId).select("name slug permissions").lean();
  if (!role) return null;

  const denied = new Set(admin.deniedPermissions ?? []);
  const permissions = [...new Set([...role.permissions, ...(admin.extraPermissions ?? [])])]
    // Denial wins, always. A revocation recorded against one person must not be
    // reinstated by someone editing the shared role.
    .filter((permission) => !denied.has(permission));

  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    roleId: String(admin.roleId),
    roleName: role.name,
    roleSlug: role.slug,
    team: admin.team ?? null,
    title: admin.title ?? null,
    avatarUrl: admin.avatarUrl ?? null,
    permissions,
    twoFactorEnabled: admin.twoFactorEnabled === true,
    lastLoginAt: admin.lastLoginAt ?? null,
  };
});

/**
 * Gate for an admin page: returns the admin, or leaves via a redirect.
 *
 * Called at the top of every admin page and Server Action, not only in the
 * layout. A Server Action is a public endpoint reachable with nothing but a
 * cookie — the layout that rendered the form is not in the request path when
 * the action runs, so a layout-only check protects the view and nothing else.
 */
export async function requireAdmin(nextPath?: string): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect(nextPath ? `/admin/login?next=${encodeURIComponent(nextPath)}` : "/admin/login");
  }
  return admin;
}

/**
 * Gate for a page that needs a specific permission.
 *
 * Answers 403 rather than redirecting to the dashboard: an admin who followed a
 * link to something they cannot see should be told so plainly. A silent bounce
 * reads as a broken link and generates a support ticket.
 */
export async function requirePermission(
  permission: string,
  nextPath?: string
): Promise<CurrentAdmin> {
  const admin = await requireAdmin(nextPath);
  if (!hasPermission(admin.permissions, permission)) forbidden();
  return admin;
}

/** Same, for a page reachable with any one of several permissions. */
export async function requireAnyPermission(
  permissions: string[],
  nextPath?: string
): Promise<CurrentAdmin> {
  const admin = await requireAdmin(nextPath);
  if (!hasAnyPermission(admin.permissions, permissions)) forbidden();
  return admin;
}

/** Convenience for conditional UI — hiding a button the action would refuse anyway. */
export function can(admin: CurrentAdmin | null, permission: string): boolean {
  return admin ? hasPermission(admin.permissions, permission) : false;
}
