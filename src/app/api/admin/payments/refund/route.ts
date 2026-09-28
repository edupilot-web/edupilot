import { z } from "zod";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { refundPayment } from "@/lib/payments/admin";

/**
 * POST /api/admin/payments/refund — send money back to the card.
 *
 * `payment.refund` is its own permission, separate from `payment.view`, because
 * this is the one admin action here that moves real money outward. A read-only
 * admin can see everything and refund nothing.
 *
 * `reason` is required by the schema rather than merely encouraged: a refund
 * with no recorded reason is indistinguishable from a mistake six months later,
 * and it is stored on both the order and the ledger row.
 */
const schema = z.object({
  orderId: z.string().min(1),
  /** Omitted refunds whatever is left on the payment. */
  amountPaise: z.number().int().positive().optional(),
  reason: z.string().trim().min(5, "Say why this is being refunded").max(500),
});

export async function POST(req: Request) {
  return withPermission("payment.refund", async (admin) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("Check the refund details", 422, { details: parsed.error.issues });
    }

    const result = await refundPayment({
      orderId: parsed.data.orderId,
      amountPaise: parsed.data.amountPaise,
      reason: parsed.data.reason,
      actorAdminId: admin.id,
    });

    if (!result.ok) {
      return fail(result.message, result.code === "not-found" ? 404 : 422, { code: result.code });
    }

    return ok({ refundId: result.refundId, amountPaise: result.amountPaise });
  });
}
