import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { addStudentComment } from "@/lib/service-requests/service";
import { commentSchema } from "@/lib/service-requests/validation";

/** POST /api/service-requests/:id/comments — the student replying. */
export async function POST(
  req: Request,
  context: RouteContext<"/api/service-requests/[id]/comments">
) {
  try {
    const session = await requireAuth();
    const { id } = await context.params;

    const parsed = commentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Write something first", 422);

    const result = await addStudentComment({
      studentId: session.sub,
      requestId: id,
      body: parsed.data.body,
      attachments: parsed.data.attachments,
    });

    if (!result.ok) {
      return fail(result.message, result.code === "not-found" ? 404 : 409, { code: result.code });
    }

    return ok({ added: true }, 201);
  } catch (err) {
    return handleError(err);
  }
}
