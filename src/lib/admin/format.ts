/**
 * Formatting shared by every admin screen.
 *
 * All of it is locale-pinned to `en-IN`. The audience is one operations team in
 * India, and a table where one row says "1,28,420" and another says "128,420"
 * because two components picked different defaults is a table nobody trusts.
 */

const NUMBER = new Intl.NumberFormat("en-IN");
const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUMBER.format(value);
}

/**
 * Abbreviates for KPI tiles: 128420 → "1.28L".
 *
 * Lakh and crore rather than K/M, because that is how the numbers will be read
 * aloud in the room where this dashboard is on the wall.
 */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 10_000_000) return `${(value / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100_000) return `${(value / 100_000).toFixed(2)}L`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return NUMBER.format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_TIME.format(date);
}

/**
 * "3 minutes ago", "2 days ago".
 *
 * Falls back to an absolute date beyond a month: "47 days ago" is a number the
 * reader has to convert, where "12 Jul 2026" is the thing they wanted.
 */
export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  return DATE.format(date);
}

/**
 * The same thing for a date that has not happened yet.
 *
 * `formatRelative` only counts backwards, so a deadline rendered through it
 * reads "-14 days ago". Everything the admin UI showed was in the past until
 * invitations, which are the first rows whose interesting date is a future one.
 *
 * It falls back to `formatRelative` once the moment has passed, because a
 * deadline that is now behind us is an ordinary past date and reading "in -1
 * days" would be the same bug the other way round.
 */
export function formatUntil(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return formatRelative(date);
  if (seconds < 60) return "in under a minute";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in ${minutes} minutes`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 30) return `in ${days} days`;

  return DATE.format(date);
}

/** "1.2 MB". Binary units, because that is what a file browser reports. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** "1m 24s" — durations here are job runtimes, not stopwatch precision. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Percentage change between two periods.
 *
 * Returns null when the previous period was zero. Every alternative is a lie:
 * "+100%" understates going from 0 to 400, and "+∞%" is not a figure anyone can
 * act on. The tile shows "No prior period" instead.
 */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/** A percentage of a whole, safe when the whole is zero. */
export function share(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}

/**
 * Masks an address for admins without `student.view_pii`.
 *
 * Keeps the first character and the domain, so a support agent can still match
 * "the r… @gmail.com account the student mentioned" without the list being a
 * harvestable directory of student addresses.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(3, Math.min(local.length - 1, 6)))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `••••••${digits.slice(-4)}`;
}

/** First letters of a name, for the avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Trims a long value for a table cell, keeping whole words where it can. */
export function truncate(value: string, max = 60): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}
