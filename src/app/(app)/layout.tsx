import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser } from "@/lib/current-user";
import { UNREAD_NOTIFICATIONS } from "@/lib/dashboard-data";

/**
 * Gate and chrome for every signed-in screen.
 *
 * proxy.ts already bounces requests with no session cookie (and adds `?next=`),
 * but a layout cannot read the URL, so this is the authoritative check: it
 * verifies the token rather than trusting that a cookie exists.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Sign-up drops the user straight into onboarding, but a session that was
  // abandoned midway would otherwise reach the app with no education details.
  if (!user.onboardingCompletedAt) redirect("/onboarding/profile");

  return (
    <AppShell name={user.name} unread={UNREAD_NOTIFICATIONS}>
      {children}
    </AppShell>
  );
}
