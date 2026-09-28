import { handleError, ok } from "@/lib/api";
import { getAcademicContextTree, requireTeacher } from "@/lib/teaching/teacher";

/**
 * GET /api/teacher/academic-context  (§9, §58)
 *
 * The whole cascade — programme → branch → regulation → semester → subject —
 * in one response, already narrowed to what this teacher may touch.
 *
 * One request rather than the admin module's five dependent ones. A teacher has
 * between one and a dozen subject assignments, so the entire tree is a few
 * dozen rows; five round trips to walk something that small would be five round
 * trips on the screen a teacher opens before everything they do.
 *
 * The college is in the response and is not a choice: it comes from the
 * profile, and there is no parameter that could ask for another one (§10).
 */
export async function GET() {
  try {
    const teacher = await requireTeacher();
    const tree = await getAcademicContextTree(teacher);

    return ok({
      context: tree,
      teacher: {
        status: teacher.status,
        canPublish: teacher.canPublish,
        collegeName: teacher.collegeName,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
