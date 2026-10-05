import { z } from "zod";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { issueInvite, listInvites, revokeInvite } from "@/lib/teaching/invites";
import { sendTeacherInviteEmail } from "@/lib/email/emailService";

/**
 * GET    /api/admin/teachers/invites — who has been asked
 * POST   /api/admin/teachers/invites — ask somebody
 * DELETE /api/admin/teachers/invites — withdraw
 *
 * `teacher.approve` rather than a new permission: inviting somebody and
 * approving them are the same decision made at different times, and splitting
 * them would let an administrator approve teachers they could not invite.
 *
 * Scoped to the administrator's own college when they have one. A college admin
 * cannot invite into another institution, because the scope comes from their
 * record rather than from the request.
 */
const inviteSchema = z.object({
  collegeId: z.string().min(1),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  designation: z.string().trim().max(120).optional(),
});

export async function GET(req: Request) {
  return withPermission("teacher.view", async (admin) => {
    const params = new URL(req.url).searchParams;

    return ok({
      invites: await listInvites({
        // A platform admin may look at one college; a college admin only ever
        // sees their own, whatever they ask for.
        collegeId: admin.collegeId ?? params.get("collegeId"),
        limit: Number(params.get("limit")) || 50,
      }),
    });
  });
}

export async function POST(req: Request) {
  return withPermission("teacher.approve", async (admin) => {
    const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the invitation", 422);
    }

    /**
     * A college admin may only invite into their own college.
     *
     * Enforced here rather than trusted from the body: the request names a
     * college, and without this a scoped administrator could name somebody
     * else's.
     */
    const collegeId = admin.collegeId ?? parsed.data.collegeId;
    if (admin.collegeId && parsed.data.collegeId !== admin.collegeId) {
      return fail("You can only invite teachers to your own college.", 403, { code: "out-of-scope" });
    }

    const result = await issueInvite({
      collegeId,
      email: parsed.data.email,
      designation: parsed.data.designation ?? null,
      admin: { id: admin.id, name: admin.name },
    });

    if (!result.ok) {
      return fail(result.message, result.code === "unknown-college" ? 404 : 409, {
        code: result.code,
      });
    }

    /**
     * Mail it, and tell the administrator whether that worked.
     *
     * Awaited rather than deferred to `after()`: an administrator invites one
     * person at a time and the next thing they do depends on the answer. If the
     * mail did not go, they need to know *now*, while the link is still on
     * screen, rather than finding out when the teacher never signs up.
     *
     * A failure does not undo the invitation. It exists in the database and the
     * link is valid; what fails is delivery, and the recourse is to send it by
     * hand, not to issue a second one.
     */
    const delivery = await sendTeacherInviteEmail({
      email: result.email,
      collegeName: result.collegeName,
      invitedByName: admin.name,
      inviteUrl: result.url,
      expiresInDays: result.expiresInDays,
      designation: result.designation,
    });

    /**
     * The link is returned to the administrator who created it regardless.
     *
     * Returned once, to the person who just asked for it, over an authenticated
     * request — and never stored in a readable form, so it cannot be fetched
     * again from the list. That is deliberate even now that mail works: a
     * bounced invitation would otherwise be unrecoverable.
     */
    return ok(
      { id: result.id, email: result.email, url: result.url, emailed: delivery.ok },
      201
    );
  });
}

export async function DELETE(req: Request) {
  return withPermission("teacher.approve", async (admin) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Which invitation?", 400);

    const revoked = await revokeInvite(id, admin.collegeId);
    if (!revoked) {
      return fail("That invitation could not be withdrawn.", 404, { code: "not-found" });
    }

    return ok({ revoked: true });
  });
}
