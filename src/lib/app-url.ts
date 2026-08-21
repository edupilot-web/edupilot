/**
 * The public origin of this deployment.
 *
 * Links that travel outside the browser — the ones in verification emails —
 * cannot be built from the incoming request: a mail client opens them hours
 * later on another machine, so a `localhost` origin captured at send time is a
 * dead link. `NEXT_PUBLIC_APP_URL` is the single place that origin is declared.
 */
const FALLBACK = "http://localhost:3000";

export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const raw = configured || FALLBACK;

  if (!configured && process.env.NODE_ENV === "production") {
    // Loud rather than silently mailing out localhost links.
    console.warn(
      "[config] NEXT_PUBLIC_APP_URL is not set. Verification links will point at " +
        `${FALLBACK}, which is unreachable for your users.`
    );
  }

  // Trailing slashes would double up when a path is appended.
  return raw.replace(/\/+$/, "");
}

/** Absolute URL for `path` ("/verify-email") on the configured origin. */
export function absoluteUrl(path: string): string {
  return `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
