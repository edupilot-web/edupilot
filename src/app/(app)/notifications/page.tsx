import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationCenter } from "@/components/app/notification-center";
import { getCurrentUser } from "@/lib/current-user";
import { listNotifications, unreadCount } from "@/lib/notifications/service";

export const metadata: Metadata = { title: "Notifications · EduPilot" };

/**
 * The notification centre (§38).
 *
 * The first page is server-rendered so the screen is complete on arrival;
 * "load older" walks the cursor from the client. Scoped to the session's user
 * by the query, with no parameter that could widen it (§71).
 */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ notifications, nextCursor }, unread] = await Promise.all([
    listNotifications(user.id, { limit: 20 }),
    unreadCount(user.id),
  ]);

  return (
    <NotificationCenter initial={notifications} initialCursor={nextCursor} unread={unread} />
  );
}
