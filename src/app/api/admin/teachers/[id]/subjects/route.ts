import { fail, ok, readJson, withPermission } from "@/lib/admin/ai/api";
import { recordAudit } from "@/lib/admin/audit";
import {
  assignSubject,
  assignableSubjects,
  getTeacher,
  revokeSubject,
} from "@/lib/admin/data/teachers";
import { HttpError } from "@/lib/api";
import { teacherSubjectAssignSchema } from "@/lib/teaching/validation";

/**
 * GET    /api/admin/teachers/:id/subjects — what they hold, and what they could
 * POST   /api/admin/teachers/:id/subjects — assign one (§57)
 * DELETE /api/admin/teachers/:id/subjects — revoke one
 *
 * This is the endpoint that actually grants a teacher the ability to do
 * anything. Approving an account makes it usable; this decides what it may
 * reach, and without a row here a teacher can publish nothing at all (§11).
 *
 * Revoking never deletes: published assignments and notes stay published, and
 * the record of who was authorised at the time is what makes them defensible
 * (§78).
 */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/teachers/[id]/subjects">) {
  return withPermission("teacher.assign", async (admin) => {
    const { id } = await ctx.params;
    const search = new URL(req.url).searchParams.get("q");

    const teacher = await getTeacher(admin, id);
    if (!teacher) return fail("That teacher could not be found.", 404, { code: "not-found" });

    return ok({
      assigned: teacher.subjects,
      available: await assignableSubjects(admin, id, search),
    });
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/admin/teachers/[id]/subjects">) {
  return withPermission("teacher.assign", async (admin) => {
    const { id } = await ctx.params;

    const parsed = teacherSubjectAssignSchema.safeParse(await readJson(req));
    if (!parsed.success) return fail("Choose a subject.", 422, { code: "invalid-subject" });

    try {
      const result = await assignSubject(admin, id, {
        subjectId: parsed.data.subjectId,
        admissionYear: parsed.data.admissionYear ?? null,
      });

      await recordAudit({
        actor: admin,
        action: "teacher.subject_assigned",
        entityType: "TeacherProfile",
        entityId: id,
        entityLabel: result.subjectName,
        metadata: { subjectId: parsed.data.subjectId, admissionYear: parsed.data.admissionYear ?? null },
      });

      return ok(result, 201);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status, { code: "refused" });
      throw err;
    }
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/teachers/[id]/subjects">) {
  return withPermission("teacher.assign", async (admin) => {
    const { id } = await ctx.params;
    const assignmentId = new URL(req.url).searchParams.get("assignmentId") ?? "";

    if (!assignmentId) return fail("Which assignment?", 400, { code: "missing-assignment" });

    try {
      await revokeSubject(admin, id, assignmentId);

      await recordAudit({
        actor: admin,
        action: "teacher.subject_revoked",
        entityType: "TeacherProfile",
        entityId: id,
        metadata: { assignmentId },
      });

      return ok({ revoked: true });
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status, { code: "refused" });
      throw err;
    }
  });
}
