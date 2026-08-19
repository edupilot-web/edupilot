/**
 * Name of the session cookie.
 *
 * Kept in its own module so proxy.ts can read it without importing lib/auth.ts,
 * which pulls in next/headers and is not available in the proxy runtime.
 */
export const SESSION_COOKIE = "edupilot_session";
