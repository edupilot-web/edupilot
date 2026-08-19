export const DEFAULT_SIGNED_IN_DESTINATION = "/dashboard";

/**
 * Sanitises a `?next=` value before it is used as a redirect target.
 *
 * Only same-origin, single-slash paths are accepted, so a crafted
 * `?next=https://evil.example` or `?next=//evil.example` cannot turn sign-in
 * into an open redirect.
 */
export function safeDestination(
  raw: unknown,
  fallback: string = DEFAULT_SIGNED_IN_DESTINATION
): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
