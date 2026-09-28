import { fail, handleError, ok, requireAuth } from "@/lib/api";
import {
  IMPLEMENTED_CHANNELS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_BLURBS,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CHANNELS,
  OPTIONAL_CATEGORIES,
} from "@/lib/notifications/fields";
import { getPreferences, savePreferences } from "@/lib/notifications/service";
import { notificationPreferenceSchema } from "@/lib/teaching/validation";
import type { ChannelPreferences } from "@/lib/notifications/fields";

/**
 * GET /api/notification-preferences — what this user has chosen
 * PUT /api/notification-preferences — change it
 *
 * The response carries the *vocabulary* alongside the values — which categories
 * exist, which may be switched off, which channels actually work — so the
 * settings screen renders from one request and cannot offer a toggle the server
 * would ignore. A switch a user sets that silently changes nothing is worse
 * than an absent one.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const preferences = await getPreferences(session.sub);

    return ok({
      ...preferences,
      categories: NOTIFICATION_CATEGORIES.map((category) => ({
        key: category,
        label: NOTIFICATION_CATEGORY_LABELS[category],
        blurb: NOTIFICATION_CATEGORY_BLURBS[category],
        // `account` is absent from the optional list: "your account was
        // rejected" is not something anyone opts out of.
        optional: OPTIONAL_CATEGORIES.includes(category),
      })),
      /**
       * `availableChannels`, not `channels`.
       *
       * `...preferences` already puts the user's own settings under `channels`,
       * so a second `channels` key here silently overwrote them and the
       * response carried the vocabulary where the values should have been —
       * every client rendering from this endpoint saw the defaults no matter
       * what was stored. TypeScript allows it because one of the two arrives
       * through a spread, which is exactly why it survived review.
       */
      availableChannels: NOTIFICATION_CHANNELS.map((channel) => ({
        key: channel,
        available: IMPLEMENTED_CHANNELS.includes(channel),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireAuth();

    const parsed = notificationPreferenceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Check the settings and try again", 422);

    /**
     * Unknown categories and channels are dropped rather than rejected.
     *
     * A client sending a stale category after a rename should not have its
     * whole save refused, and an accepted-but-unknown key would sit in the
     * document forever pretending to mean something.
     */
    const channels: Partial<ChannelPreferences> = {};

    for (const [category, values] of Object.entries(parsed.data.channels ?? {})) {
      if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) continue;
      if (!OPTIONAL_CATEGORIES.includes(category as never)) continue;

      const clean: Record<string, boolean> = {};
      for (const [channel, enabled] of Object.entries(values)) {
        if (!(NOTIFICATION_CHANNELS as readonly string[]).includes(channel)) continue;
        clean[channel] = enabled === true;
      }

      if (Object.keys(clean).length) {
        channels[category as keyof ChannelPreferences] = clean as never;
      }
    }

    await savePreferences(session.sub, {
      channels,
      mutedUntil: parsed.data.mutedUntil ?? null,
    });

    return ok(await getPreferences(session.sub));
  } catch (err) {
    return handleError(err);
  }
}
