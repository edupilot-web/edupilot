import { handleError, ok } from "@/lib/api";
import { listTeacherSubjects, requireTeacher } from "@/lib/teaching/teacher";

/**
 * GET /api/teacher/subjects  (§12, §58)
 *
 * Every subject this teacher may act on — and nothing else. §12's requirement
 * that "only subjects that teacher is authorized to teach should appear" holds
 * by construction here: the query is over `TeacherAcademicAssignment`, so an
 * unauthorised subject is not filtered out, it is never fetched.
 */
export async function GET() {
  try {
    const teacher = await requireTeacher();
    const subjects = await listTeacherSubjects(teacher);

    return ok({ subjects, count: subjects.length });
  } catch (err) {
    return handleError(err);
  }
}
