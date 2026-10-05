/**
 * The notification vocabulary: types, channels, categories and preferences.
 *
 * Its own module rather than part of `teaching/fields.ts`, because §35 is
 * explicit that assignment notifications and note notifications must not be
 * built separately — and the surest way to end up with two systems is to put
 * the vocabulary of one of them inside the other's module. Nothing here
 * mentions assignments or notes except as *values*; announcements, attendance
 * and timetable changes (§95) are new entries in these lists and nothing else.
 */

// ── Types (§35) ───────────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  "ASSIGNMENT_PUBLISHED",
  "ASSIGNMENT_UPDATED",
  "ASSIGNMENT_DUE_SOON",
  "ASSIGNMENT_OVERDUE",
  "ASSIGNMENT_GRADED",
  "NOTE_PUBLISHED",
  "TEACHER_APPROVED",
  "TEACHER_REJECTED",
  "SERVICE_REQUEST_UPDATED",
  "SERVICE_REQUEST_RESOLVED",
  "SERVICE_REQUEST_NEEDS_YOU",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

// ── Categories (§40) ──────────────────────────────────────────────────────

/**
 * What a *preference* toggle controls.
 *
 * Coarser than the type on purpose. A student who turns off "assignment
 * reminders" means all of them; giving them one switch per type would be eight
 * switches to express four intentions, and the settings screen would be a wall
 * nobody reads.
 */
export const NOTIFICATION_CATEGORIES = [
  "assignments",
  "reminders",
  "grades",
  "notes",
  "account",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  assignments: "New assignments",
  reminders: "Assignment reminders",
  grades: "Grades and feedback",
  notes: "New notes and study material",
  account: "Account and approvals",
};

export const NOTIFICATION_CATEGORY_BLURBS: Record<NotificationCategory, string> = {
  assignments: "When a teacher publishes an assignment for one of your subjects.",
  reminders: "Before an assignment is due, and if it becomes overdue.",
  grades: "When your submission has been marked.",
  notes: "When a teacher shares notes or study material.",
  account: "Approvals, rejections and changes to your account.",
};

export const TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  ASSIGNMENT_PUBLISHED: "assignments",
  ASSIGNMENT_UPDATED: "assignments",
  ASSIGNMENT_DUE_SOON: "reminders",
  ASSIGNMENT_OVERDUE: "reminders",
  ASSIGNMENT_GRADED: "grades",
  NOTE_PUBLISHED: "notes",
  TEACHER_APPROVED: "account",
  TEACHER_REJECTED: "account",
  /**
   * `account`, and therefore not optional.
   *
   * "We need something from you before this can go further" is the message that
   * decides whether a request is ever finished. A student who muted it would
   * wait indefinitely for a certificate that is waiting on them.
   */
  SERVICE_REQUEST_UPDATED: "account",
  SERVICE_REQUEST_RESOLVED: "account",
  SERVICE_REQUEST_NEEDS_YOU: "account",
};

/**
 * Categories a preference may switch off.
 *
 * `account` is absent, and that is the point: "your account was rejected" is
 * not a notification somebody opts out of, it is the only way they learn what
 * happened. A preferences screen that offered the toggle would be offering to
 * hide the one message the recipient must see.
 */
export const OPTIONAL_CATEGORIES: readonly NotificationCategory[] = [
  "assignments",
  "reminders",
  "grades",
  "notes",
];

export function isOptionalCategory(category: NotificationCategory): boolean {
  return OPTIONAL_CATEGORIES.includes(category);
}

// ── Channels (§37) ────────────────────────────────────────────────────────

export const NOTIFICATION_CHANNELS = ["in_app", "email", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In the app",
  email: "Email",
  push: "Push",
};

/**
 * Which channels a deployment can actually deliver on today.
 *
 * In-app only. Email has infrastructure (Brevo, used for verification) but no
 * templates or send policy for this traffic, and push has neither — so both are
 * listed as channels, disabled, and the preferences screen says so rather than
 * offering a switch that does nothing. A toggle a user sets and that silently
 * changes nothing is worse than an absent one.
 */
export const IMPLEMENTED_CHANNELS: readonly NotificationChannel[] = ["in_app"];

export function channelImplemented(channel: NotificationChannel): boolean {
  return IMPLEMENTED_CHANNELS.includes(channel);
}

// ── Entities (§36) ────────────────────────────────────────────────────────

/**
 * What a notification points at.
 *
 * A closed list because `entityType + entityId` is half the deduplication key
 * (§63) and the whole of the deep link (§87). An open string would let two
 * spellings of the same entity produce two notifications for one event.
 */
export const NOTIFICATION_ENTITIES = ["assignment", "note", "submission", "teacher", "service_request"] as const;
export type NotificationEntity = (typeof NOTIFICATION_ENTITIES)[number];

// ── Defaults ──────────────────────────────────────────────────────────────

export type ChannelPreferences = Record<NotificationCategory, Record<NotificationChannel, boolean>>;

/**
 * In-app on, everything else off (§40).
 *
 * The default a user gets by doing nothing is the one that cannot annoy them:
 * in-app notifications are only seen when they are already in the product.
 * Email defaults off even once it works, because a platform that starts mailing
 * students because a teacher was busy is one students mute permanently.
 */
export function defaultPreferences(): ChannelPreferences {
  const result = {} as ChannelPreferences;

  for (const category of NOTIFICATION_CATEGORIES) {
    result[category] = { in_app: true, email: false, push: false };
  }

  return result;
}

/**
 * Whether a notification of this type should be delivered on this channel.
 *
 * Three rules, in order: the channel must actually work, the category must be
 * one a user may switch off before their preference is consulted at all, and
 * only then does the stored preference decide.
 */
export function shouldDeliver(input: {
  type: NotificationType;
  channel: NotificationChannel;
  preferences?: Partial<ChannelPreferences> | null;
}): boolean {
  if (!channelImplemented(input.channel)) return false;

  const category = TYPE_CATEGORY[input.type];
  if (!isOptionalCategory(category)) return true;

  const stored = input.preferences?.[category]?.[input.channel];
  // An absent preference falls back to the default rather than to false — a
  // category added after a user saved their settings must not arrive silenced.
  return stored ?? defaultPreferences()[category][input.channel];
}

// ── Copy (§27, §34, §87) ──────────────────────────────────────────────────

export type NotificationCopy = { title: string; message: string };

/**
 * The words each notification uses, in one place.
 *
 * Here rather than at the call sites so the assignment publisher and the note
 * publisher cannot drift into two different voices, and so a deployment
 * translating the product has one file to translate rather than six services to
 * grep. The `href` is built alongside, because a notification the user cannot
 * act on is a notification that should not have been sent (§87).
 */
export function notificationCopy(
  type: NotificationType,
  data: {
    title?: string | null;
    subjectName?: string | null;
    teacherName?: string | null;
    dueAt?: Date | null;
    marks?: number | null;
    maxMarks?: number | null;
    reason?: string | null;
    /** The human ticket reference, for the help desk copy. */
    ticket?: string | null;
    statusLabel?: string | null;
  }
): NotificationCopy {
  const subject = data.subjectName ?? "your course";
  const item = data.title ?? "Untitled";

  switch (type) {
    case "ASSIGNMENT_PUBLISHED":
      return {
        title: `New assignment: ${item}`,
        message: [subject, data.teacherName, data.dueAt ? `Due ${formatDue(data.dueAt)}` : null]
          .filter(Boolean)
          .join(" · "),
      };

    case "ASSIGNMENT_UPDATED":
      return {
        title: `Assignment updated: ${item}`,
        message: [subject, data.dueAt ? `Now due ${formatDue(data.dueAt)}` : null]
          .filter(Boolean)
          .join(" · "),
      };

    case "ASSIGNMENT_DUE_SOON":
      return {
        title: `Due soon: ${item}`,
        message: `${subject} · Due ${data.dueAt ? formatDue(data.dueAt) : "shortly"}`,
      };

    case "ASSIGNMENT_OVERDUE":
      return {
        title: `Overdue: ${item}`,
        message: `${subject} · The due date has passed and you have not submitted.`,
      };

    case "ASSIGNMENT_GRADED":
      return {
        title: `Graded: ${item}`,
        message:
          data.marks !== null && data.marks !== undefined && data.maxMarks
            ? `${subject} · ${data.marks} out of ${data.maxMarks}`
            : `${subject} · Your submission has been marked.`,
      };

    case "NOTE_PUBLISHED":
      return {
        title: `New notes for ${subject}`,
        message: [item, data.teacherName].filter(Boolean).join(" · "),
      };

    /**
     * The ticket leads, because it is what the student quotes back and what
     * they will search their notifications for.
     */
    case "SERVICE_REQUEST_UPDATED":
      return {
        title: `${data.ticket ?? "Your request"}: ${data.statusLabel ?? "updated"}`,
        message: item,
      };

    case "SERVICE_REQUEST_NEEDS_YOU":
      return {
        title: `${data.ticket ?? "Your request"} needs something from you`,
        message: data.reason ?? item,
      };

    case "SERVICE_REQUEST_RESOLVED":
      return {
        title: `${data.ticket ?? "Your request"} is resolved`,
        message: data.reason ?? item,
      };

    case "TEACHER_APPROVED":
      return {
        title: "Your teacher account has been approved",
        message: "You can now be assigned subjects and publish to your students.",
      };

    case "TEACHER_REJECTED":
      return {
        title: "Your teacher account was not approved",
        message: data.reason?.trim()
          ? data.reason.trim()
          : "Contact your college administrator for details.",
      };
  }
}

/** "10 Sep, 11:59 pm" — short, and in the reader's own locale conventions. */
function formatDue(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Where clicking the notification goes (§87). */
export function notificationHref(
  entityType: NotificationEntity,
  entityId: string
): string | null {
  switch (entityType) {
    case "assignment":
      return `/assignments/${entityId}`;
    case "note":
      return `/notes/${entityId}`;
    case "submission":
      return `/assignments/${entityId}`;
    case "teacher":
      return "/teacher/dashboard";
    case "service_request":
      return `/service-requests/${entityId}`;
  }
}
