import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";
import { REQUEST_LIMITS } from "@/lib/service-requests/fields";
import { createRequest, listForStudent } from "@/lib/service-requests/service";
import { createRequestSchema } from "@/lib/service-requests/validation";

/**
 * GET  /api/service-requests — the student's own requests
 * POST /api/service-requests — raise one
 *
 * Both scoped to the session's user inside the query. There is no parameter that
 * widens either, because there is no version of these questions that is about
 * somebody else's requests.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const params = new URL(req.url).searchParams;
    const filter = params.get("filter");

    return ok(
      await listForStudent(session.sub, {
        filter: filter === "closed" || filter === "all" ? filter : "open",
      })
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    /**
     * A daily cap on top of the open-request limit in the service.
     *
     * The two guard different things: the open limit stops a queue filling with
     * one person's requests, and this stops a script filing hundreds that are
     * closed as fast as they arrive.
     */
    const limit = await consumeRateLimit(`svcreq:create:${session.sub}`, {
      limit: REQUEST_LIMITS.perDay,
      windowSeconds: 24 * 60 * 60,
    });
    if (!limit.allowed) {
      return fail("You have raised a lot of requests today. Try again tomorrow.", 429, {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const parsed = createRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("Check the form and try again", 422, parsed.error.issues);
    }

    const result = await createRequest({ studentId: session.sub, ...parsed.data });

    if (!result.ok) {
      return fail(result.message, result.code === "no-college" ? 409 : 422, { code: result.code });
    }

    return ok({ id: result.id, ticket: result.ticket }, 201);
  } catch (err) {
    return handleError(err);
  }
}
