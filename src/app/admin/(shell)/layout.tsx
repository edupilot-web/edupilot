import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminLogoutAction } from "@/lib/admin/auth-actions";
import { requireAdmin } from "@/lib/admin/current-admin";

export const metadata: Metadata = {
  title: { default: "EduPilot Admin", template: "%s · EduPilot Admin" },
  description: "Institution and student platform administration.",
  // The admin app should never appear in a search index, even if a URL leaks.
  robots: { index: false, follow: false },
};

/**
 * The gate for every signed-in admin screen.
 *
 * Sits in a `(shell)` route group so `/admin/login` — which is a sibling, not a
 * child — is not wrapped by it. A login page inside its own auth gate is an
 * infinite redirect.
 *
 * This verifies the session and resolves permissions; individual pages still
 * call `requirePermission` for their own module. The layout answers "may you be
 * in here at all", not "may you see this".
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <AdminShell
      admin={{
        name: admin.name,
        email: admin.email,
        roleName: admin.roleName,
        permissions: admin.permissions,
        avatarUrl: admin.avatarUrl,
      }}
      logoutAction={adminLogoutAction}
    >
      {children}
    </AdminShell>
  );
}
