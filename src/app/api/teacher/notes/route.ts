import { fail, handleError, ok } from "@/lib/api";
import { ValidationError } from "@/lib/teaching/assignments";
import { countAudience } from "@/lib/teaching/audience";
import { createNote } from "@/lib/teaching/notes";
import { requireSubject, requireTeacher } from "@/lib/teaching/teacher";
import { listTeacherNotes } from "@/lib/teaching/teacher-view";
import { noteCreateSchema } from "@/lib/teaching/validation";

/**
 * GET  /api/teacher/notes — this teacher's notes, with their engagement
 * POST /api/teacher/notes — create one, as a draft
 *
 * The same shape as the assignment routes, and deliberately the same
 * authorisation: a note is targeted at a cohort exactly as an assignment is, so
 * a teacher who may not set work for a subject may not share material for it
 * either.
 */
export async function GET(req: Request) {
  try {
    const teacher = await requireTeacher();
    const params = new URL(req.url).searchParams;

    const result = await listTeacherNotes(teacher, {
      status: params.get("status"),
      subjectId: params.get("subjectId"),
      limit: Number(params.get("limit")) || 25,
      skip: Number(params.get("skip")) || 0,
    });

    return ok({ notes: result.rows, total: result.total });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const teacher = await requireTeacher("CREATE_NOTE");

    const parsed = noteCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check the form and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const subject = await requireSubject(teacher, parsed.data.subjectId);
    const created = await createNote(teacher, subject, parsed.data);

    const audience = await countAudience({
      collegeId: subject.collegeId,
      programId: subject.programId,
      branchId: subject.branchId,
      regulationId: subject.regulationId,
      semester: subject.semester,
      admissionYear: subject.admissionYear,
    });

    return ok(
      {
        id: created.id,
        status: "draft",
        target: {
          collegeName: teacher.collegeName,
          programName: subject.programName,
          branchName: subject.branchName,
          regulationCode: subject.regulationCode,
          year: subject.year,
          semester: subject.semester,
          subjectName: subject.name,
          subjectCode: subject.code,
        },
        eligibleStudents: audience.count,
      },
      201
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return fail(err.message, 422, { details: { issues: err.issues } });
    }
    return handleError(err);
  }
}
