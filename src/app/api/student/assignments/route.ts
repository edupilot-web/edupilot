import { handleError, ok, requireAuth } from "@/lib/api";
import { listStudentAssignments, type AssignmentFilter } from "@/lib/teaching/student-view";

/**
 * GET /api/student/assignments  (§25, §58)
 *
 * The student's own list, read from their materialised `AssignmentStudent`
 * rows. That is the authorisation as well as the query: a student with no row
 * has no way in, and one who has changed branch keeps the work they were given
 * (§78).
 *
 * The tab counts come back with every response so the tabs can render their
 * numbers without five more requests.
 */
const FILTERS: AssignmentFilter[] = ["all", "pending", "submitted", "overdue", "completed"];

export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const params = new URL(req.url).searchParams;

    const requested = params.get("filter") ?? "all";
    const filter = (FILTERS as string[]).includes(requested)
      ? (requested as AssignmentFilter)
      : "all";

    const result = await listStudentAssignments(session.sub, {
      filter,
      subjectId: params.get("subjectId"),
      limit: Number(params.get("limit")) || 30,
      skip: Number(params.get("skip")) || 0,
    });

    return ok({
      assignments: result.cards,
      total: result.total,
      counts: result.counts,
      filter,
    });
  } catch (err) {
    return handleError(err);
  }
}
