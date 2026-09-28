import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsScreen } from "@/components/app/settings-screen";
import { getCurrentUser } from "@/lib/current-user";
import {
  IMPLEMENTED_CHANNELS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_BLURBS,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CHANNELS,
  OPTIONAL_CATEGORIES,
} from "@/lib/notifications/fields";
import { getPreferences } from "@/lib/notifications/service";

export const metadata: Metadata = { title: "Settings · EduPilot" };

/**
 * Whether a pause is still in force.
 *
 * Deliberately a module-level function rather than an expression inside the
 * component: reading the clock while rendering makes the output depend on when
 * React happens to run, and the lint rule that catches it is right to. The
 * answer is settled once, here, and travels to the client as a boolean.
 */
function isMuted(mutedUntil: string | null): boolean {
  if (!mutedUntil) return false;
  return new Date(mutedUntil).getTime() > Date.now();
}

/**
 * Notification settings.
 *
 * Server-rendered from the same service `GET /api/notification-preferences`
 * reads, so the screen paints with the real values instead of flashing
 * defaults; the client only calls the API to *write*. The vocabulary is built
 * from the same constants the route uses, which is what keeps the toggles on
 * screen and the keys the server accepts from drifting apart.
 */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const preferences = await getPreferences(user.id);

  return (
    <SettingsScreen
      account={{
        name: user.name,
        email: user.email,
        isGoogleAccount: user.isGoogleAccount,
      }}
      initial={{
        channels: preferences.channels,
        mutedUntil: preferences.mutedUntil,
        mutedActive: isMuted(preferences.mutedUntil),
        categories: NOTIFICATION_CATEGORIES.map((category) => ({
          key: category,
          label: NOTIFICATION_CATEGORY_LABELS[category],
          blurb: NOTIFICATION_CATEGORY_BLURBS[category],
          optional: OPTIONAL_CATEGORIES.includes(category),
        })),
        availableChannels: NOTIFICATION_CHANNELS.map((channel) => ({
          key: channel,
          available: IMPLEMENTED_CHANNELS.includes(channel),
        })),
      }}
    />
  );
}
