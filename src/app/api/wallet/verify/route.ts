import { z } from "zod";
import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { verifyCheckout } from "@/lib/payments/orders";

/**
 * POST /api/wallet/verify — the browser reporting that it paid.
 *
 * A **convenience**, not the guarantee. Its whole job is to move the balance
 * while the student is still looking at the screen, because "your money will
 * appear shortly" is a bad thing to say to someone who just paid.
 *
 * The webhook is what actually guarantees the credit. If this endpoint were
 * deleted tomorrow no money would be lost — students would simply see the
 * balance update a few seconds later. That is the correct dependency, and it is
 * why nothing here is allowed to be the only path to anything.
 *
 * Three things are checked before a rupee moves, and the order matters:
 *
 * 1. The **signature**, which is what makes anything the browser says credible.
 * 2. That the order belongs to **this session**, which the signature says
 *    nothing about.
 * 3. What Razorpay itself says the payment is now worth, re-fetched rather than
 *    taken from the request.
 */

const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      // No detail. A malformed verification is either a bug or a probe, and
      // neither is helped by being told which field was wrong.
      return fail("That payment could not be verified", 422);
    }

    const result = await verifyCheckout({
      userId: session.sub,
      razorpayOrderId: parsed.data.razorpay_order_id,
      razorpayPaymentId: parsed.data.razorpay_payment_id,
      signature: parsed.data.razorpay_signature,
    });

    if (!result.ok) {
      /**
       * `retry` is a 202, not an error.
       *
       * It means the payment is real but has not settled yet — auto-capture
       * resolves within seconds. The screen polls, and the webhook will finish
       * the job regardless, so this is progress rather than failure.
       */
      if (result.code === "retry") {
        return ok({ settled: false, message: "Your payment is being confirmed." }, 202);
      }

      const status =
        result.code === "bad-signature" || result.code === "unknown-order" ? 400 : 422;
      return fail(result.message, status, { code: result.code });
    }

    return ok({
      settled: true,
      balancePaise: result.balancePaise,
      creditedPaise: result.creditedPaise,
      /**
       * True when the webhook beat the browser to it. Not an error — the screen
       * shows the same success either way, and saying so here is only for
       * anyone reading the response.
       */
      alreadyCredited: result.alreadyCredited,
    });
  } catch (err) {
    return handleError(err);
  }
}
