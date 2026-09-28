import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";
import { submitAssignment } from "@/lib/teaching/submissions";
import { submissionSchema } from "@/lib/teaching/validation";

/**
 * POST /api/student/assignments/:id/submit  (§26, §58)
 *
 * Hands work in. The student's own `AssignmentStudent` row is the
 * authorisation, the assignment's window decides whether it is open and whether
 * it counts late, and the previous attempt is superseded rather than
 * overwritten (§24).
 *
 * Rate limited per student (§85): resubmitting is legitimate, resubmitting
 * forty times in a minute is a stuck client writing a row each time.
 */
const SUBMIT_LIMIT = { limit: 20, windowSeconds: 10 * 60 };

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/student/assignments/[id]/submit">
) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const allowance = await consumeRateLimits([
      { key: `assignment-submit:${session.sub}`, rule: SUBMIT_LIMIT },
    ]);

    if (!allowance.allowed) {
      return fail(
        `Too many submissions. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429
      );
    }

    const parsed = submissionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check your submission and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const result = await submitAssignment(session.sub, id, {
      content: parsed.data.content ?? null,
      language: parsed.data.language ?? null,
      links: parsed.data.links ?? [],
      attachments: parsed.data.attachments ?? [],
    });

    return ok(result, 201);
  } catch (err) {
    return handleError(err);
  }
}
