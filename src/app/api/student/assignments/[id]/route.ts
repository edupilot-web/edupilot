import { after } from "next/server";
import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { getStudentAssignment } from "@/lib/teaching/student-view";
import { recordView } from "@/lib/teaching/submissions";

/**
 * GET /api/student/assignments/:id  (§26)
 *
 * One assignment, with this student's own submission and grade attached.
 *
 * A 404 for an assignment that was never published to them — identical to one
 * that does not exist, so a probed id cannot be used to learn what another
 * cohort has been set (§94's third test).
 *
 * Opening it records a view, through `after()` so the write never sits between
 * the student and the page. The status only ever moves forwards, so re-reading
 * a graded assignment does not drop it back to `viewed` and take a submission
 * off the teacher's count.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/student/assignments/[id]">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const assignment = await getStudentAssignment(session.sub, id);
    if (!assignment) return fail("That assignment could not be found.", 404);

    after(() => recordView(session.sub, id));

    return ok({ assignment });
  } catch (err) {
    return handleError(err);
  }
}
