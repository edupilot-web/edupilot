import { NextResponse } from "next/server";
import { getCurrentAdmin, type CurrentAdmin } from "@/lib/admin/current-admin";
import { hasPermission } from "@/lib/admin/permissions";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";

/**
 * Shared plumbing for the AI admin API (spec §33, §32, §43).
 *
 * Every route in `/api/admin/ai/**` goes through `withPermission`. Centralised
 * because a route that forgot its permission check would look identical to one
 * that had it, and §33 makes publishing in particular a separately granted
 * right — the kind of thing that must be impossible to omit by accident rather
 * than merely discouraged.
 *
 * Responses follow the platform's `{ data }` / `{ error }` envelope so the AI
 * endpoints are indistinguishable from the rest of the admin API to a caller.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/**
 * An error response.
 *
 * `code` is machine-readable so the UI can act on it — offering §27's four
 * choices on `content-exists`, or pointing at a dropdown on a context failure —
 * while `message` is the sentence an operator reads. Nothing else is included:
 * §32 forbids leaking stack traces, provider payloads or keys, and the safest
 * way to honour that is for this function to be the only way a route can fail.
 */
export function fail(
  message: string,
  status = 400,
  extra?: { code?: string; field?: string; details?: unknown }
) {
  return NextResponse.json(
    { error: { message, code: extra?.code, field: extra?.field, details: extra?.details } },
    { status }
  );
}

/**
 * Requests per admin, per window, for the endpoints that cost money.
 *
 * Generation is rate limited by *account* rather than by IP: the expensive thing
 * is a provider call, and two administrators behind one office NAT must not
 * share a budget. 20 in fifteen minutes is far above normal use and well below
 * what an accidental loop would spend.
 */
const GENERATE_LIMIT = { limit: 20, windowSeconds: 15 * 60 };

export type Handler<T> = (admin: CurrentAdmin) => Promise<T>;

/**
 * Run a handler only if the caller holds the permission.
 *
 * Returns 401 for "not signed in" and 403 for "signed in but not allowed",
 * because those need different fixes and a single status would leave an operator
 * guessing which one they are looking at.
 */
export async function withPermission(
  permission: string,
  handler: Handler<Response>
): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return fail("Authentication required.", 401, { code: "unauthenticated" });

  if (!hasPermission(admin.permissions, permission)) {
    return fail(
      `You do not have the "${permission}" permission.`,
      403,
      { code: "forbidden" }
    );
  }

  try {
    return await handler(admin);
  } catch (err) {
    // The last line of defence. Anything reaching here is a bug, not a
    // condition — so it is logged in full for the operator and reduced to one
    // sentence for the caller.
    console.error(`[ai-api] unhandled failure in a ${permission} route:`, err);
    return fail("Something went wrong on our end. Please try again.", 500, {
      code: "internal-error",
    });
  }
}

/** Adds a per-admin rate limit on top of the permission check. */
export async function withGenerationLimit(
  permission: string,
  handler: Handler<Response>
): Promise<Response> {
  return withPermission(permission, async (admin) => {
    const allowance = await consumeRateLimits([
      { key: `ai-generate:${admin.id}`, rule: GENERATE_LIMIT },
    ]);

    if (!allowance.allowed) {
      return fail(
        `Too many generation requests. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429,
        { code: "rate-limited" }
      );
    }

    return handler(admin);
  });
}

/** Read a JSON body, treating a malformed one as a client error not a crash. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await req.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readString(body: Record<string, unknown> | null, key: string): string {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function readNumber(body: Record<string, unknown> | null, key: string): number | null {
  const value = body?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function readStringArray(body: Record<string, unknown> | null, key: string): string[] {
  const value = body?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
