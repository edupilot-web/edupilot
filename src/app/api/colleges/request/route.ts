import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";
import { requestCollege } from "@/lib/onboarding/save";

/**
 * POST /api/colleges/request — "Can't find your college?" (spec §36)
 *
 * Rate limited per account. The college directory is reference data every other
 * student picks from, so this endpoint is the one place an unauthenticated-ish
 * user can write into an admin queue — and a queue anyone can flood is a queue
 * nobody works.
 */
const REQUEST_LIMIT = { limit: 5, windowSeconds: 60 * 60 };

export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    const allowance = await consumeRateLimits([
      { key: `college-request:${session.sub}`, rule: REQUEST_LIMIT },
    ]);
    if (!allowance.allowed) {
      return fail(
        `You have requested several colleges already. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object") return fail("Send a JSON body", 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return fail("Send a JSON body", 400);
    }

    const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");

    const result = await requestCollege(session.sub, {
      collegeName: str("collegeName"),
      stateId: str("stateId"),
      city: str("city"),
      district: str("district"),
      website: str("website"),
      universityHint: str("universityHint"),
    });

    if (!result.ok) return fail(result.message, 400);

    return ok({
      status: result.status,
      message: result.message,
      /**
       * Present when the college turned out to exist under another spelling, so
       * the UI can select it for the student rather than making them search
       * again for a name they have already failed to find.
       */
      collegeId: result.collegeId ?? null,
    });
  } catch (err) {
    return handleError(err);
  }
}
