import { handleError, ok } from "@/lib/api";
import { listSubmissions } from "@/lib/teaching/submissions";
import { requireTeacher } from "@/lib/teaching/teacher";

/**
 * GET /api/teacher/assignments/:id/submissions  (§43)
 *
 * The submission table: every student the assignment reached, and where each
 * stands. Filtered by status, searchable, paginated (§90, §91).
 *
 * The projection is what §45 allows and nothing more — name, email, status,
 * marks. The query starts from `AssignmentStudent`, so the student list *is*
 * the audience: there is no parameter that reaches a student who is not on this
 * assignment, and no field that exposes an account detail a teacher does not
 * need to mark work.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/teacher/assignments/[id]/submissions">
) {
  try {
    const teacher = await requireTeacher("VIEW_SUBMISSIONS");
    const { id } = await ctx.params;
    const params = new URL(req.url).searchParams;

    const result = await listSubmissions(teacher, id, {
      status: params.get("status"),
      search: params.get("q"),
      limit: Number(params.get("limit")) || 50,
      skip: Number(params.get("skip")) || 0,
    });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
