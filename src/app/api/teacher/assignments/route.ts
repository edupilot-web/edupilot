import { fail, handleError, ok } from "@/lib/api";
import {
  createAssignment,
  ValidationError,
} from "@/lib/teaching/assignments";
import { countAudience } from "@/lib/teaching/audience";
import { requireSubject, requireTeacher } from "@/lib/teaching/teacher";
import { listTeacherAssignments } from "@/lib/teaching/teacher-view";
import { assignmentCreateSchema } from "@/lib/teaching/validation";

/**
 * GET  /api/teacher/assignments — this teacher's assignments
 * POST /api/teacher/assignments — create one, as a draft
 *
 * Creating never publishes. §16's flow is `DRAFT → PUBLISHED` and the split is
 * load-bearing: publishing resolves an audience, writes a row per student and
 * fans out notifications, and doing that implicitly on a form submit would mean
 * a teacher who mistyped a due date has already told two hundred people.
 *
 * The body carries a `subjectId` and no other academic id (§10, §77). Every
 * college, programme, branch and regulation on the stored row comes from the
 * *authorised subject*, so there is nothing a caller could supply that would
 * file work under another college.
 */
export async function GET(req: Request) {
  try {
    const teacher = await requireTeacher();
    const params = new URL(req.url).searchParams;

    const { rows, total } = await listTeacherAssignments(teacher, {
      status: params.get("status"),
      subjectId: params.get("subjectId"),
      search: params.get("q"),
      limit: Number(params.get("limit")) || 25,
      skip: Number(params.get("skip")) || 0,
    });

    return ok({ assignments: rows, total });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    /**
     * `CREATE_ASSIGNMENT` is a publishing capability, so a pending teacher is
     * refused here with an explanation rather than at publish time — after
     * they have written the whole thing.
     */
    const teacher = await requireTeacher("CREATE_ASSIGNMENT");

    const parsed = assignmentCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check the form and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const input = parsed.data;

    // The subject gate. A teacher not assigned to it gets a 403 naming the
    // reason — they are a colleague, and the subject's existence is not a
    // secret from them.
    const subject = await requireSubject(teacher, input.subjectId);

    const created = await createAssignment(teacher, subject, {
      ...input,
      allowLateSubmission: input.allowLateSubmission ?? false,
    });

    /**
     * The audience preview travels with the draft (§15).
     *
     * Computed here rather than left to a second request, because the number is
     * what gives a teacher confidence that the right students will receive it —
     * and a preview fetched separately can disagree with the publish.
     */
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
        audienceNotes: audience.skipped,
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
