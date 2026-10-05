import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { getForAdmin } from "@/lib/service-requests/admin";
import { transitionRequest } from "@/lib/service-requests/service";
import { adminUpdateSchema } from "@/lib/service-requests/validation";

/**
 * GET   /api/admin/service-requests/:id — one request, internal notes included
 * PATCH /api/admin/service-requests/:id — assign, reply, move, resolve
 *
 * `service_request.handle` is a separate permission from `.view`: reading a
 * queue and closing somebody's request are different acts, and a read-only admin
 * should be able to do the first and not the second.
 *
 * One endpoint for every change rather than five, because they arrive together —
 * a clerk assigns it to themselves, writes a reply and moves it to in-progress in
 * one action, and three round trips would leave three chances to half-apply it.
 */
export async function GET(_req: Request, context: RouteContext<"/api/admin/service-requests/[id]">) {
  return withPermission("service_request.view", async (admin) => {
    const { id } = await context.params;

    const detail = await getForAdmin({ id: admin.id, collegeId: admin.collegeId }, id);
    if (!detail) return fail("That request does not exist.", 404, { code: "not-found" });

    return ok(detail);
  });
}

export async function PATCH(
  req: Request,
  context: RouteContext<"/api/admin/service-requests/[id]">
) {
  return withPermission("service_request.handle", async (admin) => {
    const { id } = await context.params;

    const parsed = adminUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("Check the update and try again.", 422, { details: parsed.error.issues });
    }

    const result = await transitionRequest({
      requestId: id,
      admin: { id: admin.id, name: admin.name, collegeId: admin.collegeId },
      to: parsed.data.status,
      priority: parsed.data.priority,
      assignToSelf: parsed.data.assignToSelf,
      comment: parsed.data.comment,
      internal: parsed.data.internal,
      resolution: parsed.data.resolution,
      resolutionAttachments: parsed.data.resolutionAttachments,
    });

    if (!result.ok) {
      return fail(result.message, result.code === "not-found" ? 404 : 422, { code: result.code });
    }

    return ok({ updated: true });
  });
}
