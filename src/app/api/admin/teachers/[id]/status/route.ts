import { fail, ok, readJson, withPermission } from "@/lib/admin/ai/api";
import { recordAudit } from "@/lib/admin/audit";
import { getTeacher, setTeacherStatus } from "@/lib/admin/data/teachers";
import { HttpError } from "@/lib/api";
import { teacherStatusSchema } from "@/lib/teaching/validation";
import type { TeacherStatus } from "@/lib/teaching/fields";

/**
 * POST /api/admin/teachers/:id/status  (§4, §56)
 *
 * Approve, reject, suspend or reinstate. The transition table decides what is
 * legal, so a caller cannot invent a path — and a rejection or a suspension
 * needs a reason, because it is the only thing the teacher will be told.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/teachers/[id]/status">) {
  return withPermission("teacher.approve", async (admin) => {
    const { id } = await ctx.params;

    const parsed = teacherStatusSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      return fail("Choose a status.", 422, { code: "invalid-status" });
    }

    const before = await getTeacher(admin, id);
    if (!before) return fail("That teacher could not be found.", 404, { code: "not-found" });

    try {
      const result = await setTeacherStatus(
        admin,
        id,
        parsed.data.status as TeacherStatus,
        parsed.data.reason ?? null
      );

      await recordAudit({
        actor: admin,
        action: `teacher.${result.status}`,
        entityType: "TeacherProfile",
        entityId: id,
        entityLabel: before.name,
        before: { status: before.status },
        after: { status: result.status },
        metadata: { collegeId: before.collegeId, reason: parsed.data.reason ?? null },
      });

      return ok(result);
    } catch (err) {
      if (err instanceof HttpError) {
        return fail(err.message, err.status, { code: "transition-refused" });
      }
      throw err;
    }
  });
}
