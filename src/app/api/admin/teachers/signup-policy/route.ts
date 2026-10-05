import { z } from "zod";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { policyFor, setPolicy } from "@/lib/teaching/invites";
import { TEACHER_SIGNUP_MODES } from "@/lib/teaching/fields";

/**
 * GET   /api/admin/teachers/signup-policy — what this college requires
 * PATCH /api/admin/teachers/signup-policy — change it
 *
 * `teacher.approve`, the same permission as inviting. Who may register and who
 * may be approved are one decision taken at two moments, and an administrator
 * who can wave a teacher through the queue can already do everything the policy
 * controls.
 *
 * Scoped to the administrator's own college when they have one, like every
 * other teacher route: the scope comes from their record, so a college admin
 * cannot name somebody else's institution in the body.
 */
const patchSchema = z.object({
  collegeId: z.string().min(1),
  mode: z.enum(TEACHER_SIGNUP_MODES),
  /** Free text as typed; `setPolicy` normalises and rejects. */
  allowedDomains: z.array(z.string().trim().max(253)).max(25).optional(),
  autoApprove: z.boolean().optional(),
});

export async function GET(req: Request) {
  return withPermission("teacher.view", async (admin) => {
    const collegeId = admin.collegeId ?? new URL(req.url).searchParams.get("collegeId");
    if (!collegeId) return fail("Which college?", 400);

    const policy = await policyFor(collegeId);
    if (!policy) return fail("That college does not exist", 404);

    return ok({ policy });
  });
}

export async function PATCH(req: Request) {
  return withPermission("teacher.approve", async (admin) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the settings", 422);
    }

    if (admin.collegeId && parsed.data.collegeId !== admin.collegeId) {
      return fail("You can only change your own college's settings.", 403, {
        code: "out-of-scope",
      });
    }

    const result = await setPolicy({
      collegeId: admin.collegeId ?? parsed.data.collegeId,
      mode: parsed.data.mode,
      allowedDomains: parsed.data.allowedDomains,
      autoApprove: parsed.data.autoApprove,
    });

    if (!result.ok) {
      return fail(result.message, result.code === "unknown-college" ? 404 : 422, {
        code: result.code,
      });
    }

    return ok({ policy: result.policy });
  });
}
