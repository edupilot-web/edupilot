import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Notification, NotificationPreference } from "@/models/Notification";
import {
  TYPE_CATEGORY,
  defaultPreferences,
  notificationCopy,
  notificationHref,
  shouldDeliver,
  type ChannelPreferences,
  type NotificationChannel,
  type NotificationEntity,
  type NotificationType,
} from "@/lib/notifications/fields";

/**
 * NotificationService (§35, §37, §62, §63).
 *
 * One service for every notification in the platform. Assignments and notes do
 * not each own a copy of "work out who wants this, write the rows, mark them
 * delivered" — they raise an event and this decides everything else.
 *
 * Three properties the callers depend on:
 *
 *   - **Bulk, not a loop.** §62 forbids `for each student: insert`. One
 *     `bulkWrite` sends a thousand recipients in a single round trip.
 *   - **Idempotent.** The unique index on
 *     `(recipientId, type, entityType, entityId)` means a retried job writes
 *     nothing the second time (§63). The fan-out is the code most likely to be
 *     retried, so this is a database guarantee rather than a check it has to
 *     remember.
 *   - **Never throws at the caller.** A failed notification must not fail the
 *     publish it is describing. The assignment exists and the student can find
 *     it in their list; a missing prompt is a smaller loss than a rolled-back
 *     publish.
 *
 * Creation and delivery are separate (§37). This writes the row — which *is*
 * the in-app notification — and hands the same payload to whichever other
 * channels are configured. Nothing here imports an email client.
 */

// ── Provider seam (§37, §75) ──────────────────────────────────────────────

export type DeliverablePayload = {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string | null;
  href: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * A delivery channel.
 *
 * The in-app channel is the database write itself and has no provider — the
 * row is the notification. Email and push get one each when they are built, and
 * `deliver` returns the recipients it actually reached so the caller can mark
 * them without assuming success.
 */
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  isConfigured(): boolean;
  deliver(payloads: DeliverablePayload[]): Promise<{ deliveredTo: string[] }>;
}

/**
 * Registered providers, by channel.
 *
 * Empty today, and that is the honest state: `IMPLEMENTED_CHANNELS` lists only
 * `in_app`, so no provider is registered and the preferences screen shows email
 * and push as unavailable rather than offering a switch that does nothing. A
 * Brevo provider drops in here and nothing else in the module changes — which
 * is the seam §75 asks for.
 */
const PROVIDERS = new Map<NotificationChannel, NotificationProvider>();

export function registerNotificationProvider(provider: NotificationProvider): void {
  PROVIDERS.set(provider.channel, provider);
}

// ── Sending ───────────────────────────────────────────────────────────────

export type NotifyInput = {
  /** Every recipient of this one event. */
  recipientIds: (Types.ObjectId | string)[];
  type: NotificationType;
  entityType: NotificationEntity;
  entityId: Types.ObjectId | string;
  /** Interpolated into the copy, and denormalised onto the row for the card. */
  data?: {
    title?: string | null;
    subjectName?: string | null;
    teacherName?: string | null;
    dueAt?: Date | null;
    marks?: number | null;
    maxMarks?: number | null;
    reason?: string | null;
    /** The help desk's human reference, e.g. `SR-2026-00042`. */
    ticket?: string | null;
    statusLabel?: string | null;
  };
  /** Groups one publish, so a bad fan-out can be traced. */
  batchId?: string | null;
};

export type NotifyResult = {
  created: number;
  /** Recipients whose preferences silenced this. Not a failure. */
  suppressed: number;
  /** Already had this notification — a retry, and the point of the index. */
  duplicates: number;
  failed: number;
};

/**
 * Send one notification to many recipients.
 *
 * The chunk size is 500. Large enough that a cohort is one or two round trips,
 * small enough that a single `bulkWrite` stays well inside the 16MB command
 * limit however long the copy is — and small enough that a failure loses one
 * chunk rather than the whole publish.
 */
const CHUNK_SIZE = 500;

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const result: NotifyResult = { created: 0, suppressed: 0, duplicates: 0, failed: 0 };

  const recipientIds = [...new Set(input.recipientIds.map(String))].filter((id) =>
    Types.ObjectId.isValid(id)
  );

  if (!recipientIds.length) return result;

  try {
    await connectDB();

    const preferences = await loadPreferences(recipientIds);
    const copy = notificationCopy(input.type, input.data ?? {});
    const category = TYPE_CATEGORY[input.type];
    const href = notificationHref(input.entityType, String(input.entityId));

    const wanted = recipientIds.filter((recipientId) => {
      const own = preferences.get(recipientId);
      if (own?.mutedUntil && own.mutedUntil > new Date()) return false;
      return shouldDeliver({ type: input.type, channel: "in_app", preferences: own?.channels });
    });

    result.suppressed = recipientIds.length - wanted.length;
    if (!wanted.length) return result;

    const metadata = compactMetadata(input.data);

    for (let index = 0; index < wanted.length; index += CHUNK_SIZE) {
      const chunk = wanted.slice(index, index + CHUNK_SIZE);

      /**
       * `insertOne` with `ordered: false`, not an upsert.
       *
       * A duplicate must be a *no-op*, not an update: re-running a fan-out
       * should never resurrect a notification the student has already read by
       * resetting `isRead`. Unordered lets the rest of the chunk land when one
       * row collides, and the collisions are counted rather than thrown.
       */
      const operations = chunk.map((recipientId) => ({
        insertOne: {
          document: {
            recipientId: new Types.ObjectId(recipientId),
            type: input.type,
            category,
            title: copy.title,
            message: copy.message,
            entityType: input.entityType,
            entityId: new Types.ObjectId(String(input.entityId)),
            href,
            metadata,
            isRead: false,
            deliveredChannels: ["in_app"],
            batchId: input.batchId ?? null,
            createdAt: new Date(),
          },
        },
      }));

      try {
        const written = await Notification.bulkWrite(operations, { ordered: false });
        result.created += written.insertedCount ?? 0;
      } catch (err) {
        const { inserted, duplicates, failed } = readBulkError(err, chunk.length);
        result.created += inserted;
        result.duplicates += duplicates;
        result.failed += failed;
      }
    }

    await deliverToOtherChannels({ input, copy, href, metadata, recipientIds: wanted, preferences });
  } catch (err) {
    // The publish that raised this event has already happened and the content
    // is reachable. Losing the prompt is the smaller failure.
    console.error(`[notifications] could not send ${input.type}:`, err);
    result.failed += recipientIds.length - result.created;
  }

  return result;
}

/**
 * Hand the same payload to every other configured channel.
 *
 * Runs after the rows are written, and its failures are swallowed
 * independently: an email outage must not lose the in-app notification that
 * already succeeded.
 */
async function deliverToOtherChannels(context: {
  input: NotifyInput;
  copy: { title: string; message: string };
  href: string | null;
  metadata: Record<string, unknown> | null;
  recipientIds: string[];
  preferences: Map<string, { channels: Partial<ChannelPreferences> | null; mutedUntil: Date | null }>;
}): Promise<void> {
  if (PROVIDERS.size === 0) return;

  for (const [channel, provider] of PROVIDERS) {
    if (!provider.isConfigured()) continue;

    const wanted = context.recipientIds.filter((recipientId) =>
      shouldDeliver({
        type: context.input.type,
        channel,
        preferences: context.preferences.get(recipientId)?.channels,
      })
    );

    if (!wanted.length) continue;

    try {
      const { deliveredTo } = await provider.deliver(
        wanted.map((recipientId) => ({
          recipientId,
          type: context.input.type,
          title: context.copy.title,
          message: context.copy.message,
          href: context.href,
          metadata: context.metadata,
        }))
      );

      if (deliveredTo.length) {
        await Notification.updateMany(
          {
            recipientId: { $in: deliveredTo.map((id) => new Types.ObjectId(id)) },
            type: context.input.type,
            entityType: context.input.entityType,
            entityId: new Types.ObjectId(String(context.input.entityId)),
          },
          { $addToSet: { deliveredChannels: channel } }
        );
      }
    } catch (err) {
      console.error(`[notifications] ${channel} delivery failed:`, err);
    }
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────

export type NotificationView = {
  id: string;
  type: NotificationType;
  category: string;
  title: string;
  message: string | null;
  href: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

/**
 * One page of a user's notifications.
 *
 * Cursor pagination on `createdAt` (§91), not `skip`: a notification list is
 * append-at-the-top, so an offset shifts under the reader every time something
 * new arrives and page two silently repeats a row from page one.
 */
export async function listNotifications(
  userId: string,
  options: { cursor?: string | null; limit?: number; unreadOnly?: boolean } = {}
): Promise<{ notifications: NotificationView[]; nextCursor: string | null }> {
  await connectDB();

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

  const filter: Record<string, unknown> = { recipientId: userId };
  if (options.unreadOnly) filter.isRead = false;
  if (options.cursor) {
    const before = new Date(options.cursor);
    if (!Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
  }

  // One extra row, to learn whether there is a next page without a count.
  const rows = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const page = rows.slice(0, limit);

  return {
    notifications: page.map(toView),
    nextCursor:
      rows.length > limit ? (page.at(-1)?.createdAt?.toISOString() ?? null) : null,
  };
}

export async function unreadCount(userId: string): Promise<number> {
  await connectDB();
  // Capped: the bell shows "99+" past this, and counting a hundred thousand
  // rows to render a two-character badge is work nobody sees.
  return Notification.countDocuments({ recipientId: userId, isRead: false }).limit(100);
}

export async function markRead(userId: string, notificationId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(notificationId)) return false;

  await connectDB();

  const result = await Notification.updateOne(
    // Scoped to the owner inside the filter, so another user's id updates
    // nothing rather than being fetched and then rejected.
    { _id: notificationId, recipientId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  // A row already read is a success, not a 404: two taps on one card must not
  // produce an error on the second.
  return result.matchedCount === 1 || (await exists(userId, notificationId));
}

export async function markAllRead(userId: string): Promise<number> {
  await connectDB();

  const result = await Notification.updateMany(
    { recipientId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return result.modifiedCount ?? 0;
}

async function exists(userId: string, notificationId: string): Promise<boolean> {
  const row = await Notification.exists({ _id: notificationId, recipientId: userId });
  return Boolean(row);
}

// ── Preferences ───────────────────────────────────────────────────────────

export async function getPreferences(userId: string): Promise<{
  channels: ChannelPreferences;
  mutedUntil: string | null;
}> {
  await connectDB();

  const row = await NotificationPreference.findOne({ userId }).lean();
  const stored = (row?.channels ?? null) as Partial<ChannelPreferences> | null;

  // Merged over the defaults rather than returned raw, so a category added
  // after the row was written arrives switched on instead of missing.
  const defaults = defaultPreferences();
  const channels = { ...defaults };

  for (const category of Object.keys(defaults) as (keyof ChannelPreferences)[]) {
    channels[category] = { ...defaults[category], ...(stored?.[category] ?? {}) };
  }

  return { channels, mutedUntil: row?.mutedUntil?.toISOString() ?? null };
}

export async function savePreferences(
  userId: string,
  input: { channels?: Partial<ChannelPreferences>; mutedUntil?: Date | null }
): Promise<void> {
  await connectDB();

  const current = await getPreferences(userId);
  const merged = { ...current.channels };

  for (const [category, channels] of Object.entries(input.channels ?? {})) {
    const key = category as keyof ChannelPreferences;
    if (!merged[key]) continue;
    merged[key] = { ...merged[key], ...channels };
  }

  await NotificationPreference.updateOne(
    { userId },
    {
      $set: {
        channels: merged,
        ...(input.mutedUntil !== undefined ? { mutedUntil: input.mutedUntil } : {}),
      },
      $setOnInsert: { userId },
    },
    { upsert: true }
  );
}

async function loadPreferences(
  recipientIds: string[]
): Promise<Map<string, { channels: Partial<ChannelPreferences> | null; mutedUntil: Date | null }>> {
  const rows = await NotificationPreference.find({ userId: { $in: recipientIds } })
    .select("userId channels mutedUntil")
    .lean();

  return new Map(
    rows.map((row) => [
      String(row.userId),
      {
        channels: (row.channels ?? null) as Partial<ChannelPreferences> | null,
        mutedUntil: row.mutedUntil ?? null,
      },
    ])
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toView(row: {
  _id: Types.ObjectId;
  type: string;
  category: string;
  title: string;
  message?: string | null;
  href?: string | null;
  metadata?: unknown;
  isRead: boolean;
  createdAt?: Date;
}): NotificationView {
  return {
    id: String(row._id),
    type: row.type as NotificationType,
    category: row.category,
    title: row.title,
    message: row.message ?? null,
    href: row.href ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    isRead: row.isRead,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

/** Only the scalars the card renders, so the row stays small. */
function compactMetadata(data: NotifyInput["data"]): Record<string, unknown> | null {
  if (!data) return null;

  const out: Record<string, unknown> = {};
  if (data.subjectName) out.subjectName = data.subjectName;
  if (data.teacherName) out.teacherName = data.teacherName;
  if (data.dueAt) out.dueAt = data.dueAt.toISOString();
  if (data.marks !== null && data.marks !== undefined) out.marks = data.marks;
  if (data.maxMarks) out.maxMarks = data.maxMarks;

  return Object.keys(out).length ? out : null;
}

/**
 * Read a `bulkWrite` rejection.
 *
 * Mongo reports a partially-successful unordered bulk as an *error* carrying
 * the successes, which is why this cannot simply be a catch-and-give-up: the
 * duplicates are the expected case on a retry, and treating the whole chunk as
 * failed would make every retry look like an outage.
 */
function readBulkError(
  err: unknown,
  chunkSize: number
): { inserted: number; duplicates: number; failed: number } {
  const error = err as {
    insertedCount?: number;
    result?: { nInserted?: number };
    writeErrors?: { code?: number }[];
  };

  const inserted = error.insertedCount ?? error.result?.nInserted ?? 0;
  const writeErrors = error.writeErrors ?? [];
  const duplicates = writeErrors.filter((entry) => entry.code === 11000).length;

  return {
    inserted,
    duplicates,
    failed: Math.max(0, chunkSize - inserted - duplicates),
  };
}
