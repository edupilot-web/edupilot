import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { appGateRedirect } from "@/lib/auth-routing";
import { getCurrentUser } from "@/lib/current-user";
import { UNREAD_NOTIFICATIONS } from "@/lib/dashboard-data";

/**
 * Gate and chrome for every signed-in screen.
 *
 * proxy.ts already bounces requests with no session cookie (and adds `?next=`),
 * but a layout cannot read the URL, so this is the authoritative check: it
 * verifies the token rather than trusting that a cookie exists.
 *
 * The two conditions past "is there a user" — a confirmed address, a finished
 * profile — come from `appGateRedirect`, the same function the sign-in paths
 * use to choose a destination. One definition, so a gate can never send someone
 * to a screen that sends them straight back.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const elsewhere = appGateRedirect(user);
  if (elsewhere) redirect(elsewhere);

  return (
    <AppShell name={user.name} unread={UNREAD_NOTIFICATIONS}>
      {children}
    </AppShell>
  );
}
