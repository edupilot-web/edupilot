import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_ENTITIES,
  NOTIFICATION_TYPES,
} from "@/lib/notifications/fields";

/**
 * Notifications: one collection for every kind, and the preferences that decide
 * who gets them.
 *
 * §35 is explicit that assignment notifications and note notifications must not
 * be built separately, and this schema is where that is enforced rather than
 * merely intended: there is no `assignmentId` field and no `noteId` field, only
 * `entityType` + `entityId`. A future announcement or attendance notification
 * (§95) is a new value in an enum, not a new table and not a new service.
 *
 * `recipientId` is a `User`, not a student — teachers receive notifications too
 * (§35's `TEACHER_APPROVED`), and a student-only collection would have needed a
 * second one within a week.
 */

const notificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    /** Coarser than the type. What a preference toggle actually controls. */
    category: { type: String, enum: NOTIFICATION_CATEGORIES, required: true },

    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, default: null, maxlength: 500 },

    entityType: { type: String, enum: NOTIFICATION_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    /**
     * Where clicking it goes.
     *
     * Stored rather than derived on read, so the list renders without a
     * per-row switch — and so a link that was correct when sent keeps working
     * if the route later changes shape.
     */
    href: { type: String, default: null, maxlength: 400 },

    /**
     * A handful of scalars the card renders: the subject, the teacher, the due
     * date. Denormalised so a notification list of twenty is one query rather
     * than twenty joins across three collections.
     */
    metadata: { type: Schema.Types.Mixed, default: null },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },

    /**
     * What has actually been delivered, per channel.
     *
     * Creating a notification and delivering it are separate (§37): the row
     * exists the moment the event happens, and each channel marks itself here
     * when it succeeds. Without this an email retry cannot tell a message it
     * already sent from one it has not.
     */
    deliveredChannels: { type: [String], enum: NOTIFICATION_CHANNELS, default: ["in_app"] },

    /** Grouping for one publish, so a bad fan-out can be traced or undone. */
    batchId: { type: String, default: null, index: true, maxlength: 40 },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/**
 * Deduplication (§63).
 *
 * The unique key is exactly what §63 asks for: one notification of one type,
 * about one entity, per recipient. A double-publish, a retried job and a
 * partially-failed fan-out all converge on the same row instead of sending a
 * student the same assignment twice — and it is a *database* guarantee rather
 * than a check the fan-out has to remember to perform, which matters because
 * the fan-out is the code most likely to be retried.
 *
 * `ASSIGNMENT_DUE_SOON` is the case this constrains awkwardly and correctly:
 * two reminders for one assignment would collide, so the reminder that has
 * already gone out is tracked on `AssignmentStudent.remindersSent` and the
 * second reminder is a different *type*. That is the honest shape — "due in 24
 * hours" and "due in 2 hours" really are different messages.
 */
notificationSchema.index(
  { recipientId: 1, type: 1, entityType: 1, entityId: 1 },
  { unique: true }
);

/** §36's indexes: the list, and the unread filter. */
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ entityType: 1, entityId: 1 });

/**
 * Expiry.
 *
 * Ninety days. A notification is a prompt to act, not a record — the
 * assignment, the submission and the grade are all stored elsewhere and
 * outlive it. Without a TTL this is the collection that grows fastest in the
 * whole platform: one row per student per publish, forever.
 */
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;

resetModelInDev("Notification");

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ||
  mongoose.model<NotificationDoc>("Notification", notificationSchema);

// ── Preferences (§40) ─────────────────────────────────────────────────────

/**
 * One row per user, holding a nested map of category → channel → boolean.
 *
 * `Mixed` rather than a field per combination: five categories times three
 * channels is fifteen booleans, and adding a sixth category would be a
 * migration. The shape is policed by `defaultPreferences()` and
 * `shouldDeliver()` in `notifications/fields.ts`, which is the single place
 * that knows what a valid preference set looks like.
 *
 * A user with no row is not a user with nothing switched on: the absence means
 * "never chosen", and `shouldDeliver` falls back to the defaults. That is why
 * nothing creates a row on signup — fifteen booleans written for every account
 * that will never open the settings screen.
 */
const notificationPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    channels: { type: Schema.Types.Mixed, default: null },
    /**
     * A global mute, separate from the per-category switches.
     *
     * Someone who wants silence for a week should not have to clear twelve
     * checkboxes and remember to set them all back.
     */
    mutedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export type NotificationPreferenceDoc = InferSchemaType<typeof notificationPreferenceSchema>;

resetModelInDev("NotificationPreference");

export const NotificationPreference: Model<NotificationPreferenceDoc> =
  (mongoose.models.NotificationPreference as Model<NotificationPreferenceDoc>) ||
  mongoose.model<NotificationPreferenceDoc>(
    "NotificationPreference",
    notificationPreferenceSchema
  );
