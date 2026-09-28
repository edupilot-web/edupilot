import { fail, handleError, ok } from "@/lib/api";
import { transitionAssignment } from "@/lib/teaching/assignments";
import { requireTeacher } from "@/lib/teaching/teacher";
import type { AssignmentStatus } from "@/lib/teaching/fields";

/**
 * POST /api/teacher/assignments/:id/close  (§16, §58)
 *
 * Closing stops submissions; it does not hide the assignment. Students keep
 * their row, their submission and their grade, and the card says "closed"
 * rather than disappearing — an assignment that vanished after its deadline
 * would take the student's own record of it with them.
 *
 * The body may ask for `archived` or `published` instead, so one endpoint
 * serves every state change §16 allows. The transition table decides what is
 * legal, not the caller.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/teacher/assignments/[id]/close">) {
  try {
    const teacher = await requireTeacher("CLOSE_ASSIGNMENT");
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
    const requested = typeof body?.status === "string" ? body.status : "closed";

    if (!["closed", "archived", "published"].includes(requested)) {
      return fail("That is not a status an assignment can be moved to.", 422);
    }

    const result = await transitionAssignment(teacher, id, requested as AssignmentStatus);

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
