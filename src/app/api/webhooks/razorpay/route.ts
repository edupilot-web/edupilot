import { after } from "next/server";
import { connectDB } from "@/lib/db";
import { PaymentOrder } from "@/models/PaymentOrder";
import { isHandledEvent, refundKeyFor } from "@/lib/payments/fields";
import { verifyWebhookSignature, isWebhookConfigured } from "@/lib/payments/razorpay";
import { settlePayment } from "@/lib/payments/orders";
import { debitForRefund } from "@/lib/payments/wallet";

/**
 * POST /api/webhooks/razorpay — the authoritative settlement path.
 *
 * The browser callback is a convenience: it makes the balance move while the
 * student is still looking at the screen. **This** is what actually guarantees a
 * paid wallet gets credited, because it does not depend on the student keeping
 * a tab open, their network surviving the redirect, or their browser running our
 * JavaScript at all. A student who pays and immediately closes their laptop is
 * credited by this route and nothing else.
 *
 * Four things make it safe, and all four are load-bearing:
 *
 * 1. **No session.** Razorpay has no cookie. The signature *is* the
 *    authentication, so it is checked before anything else happens.
 * 2. **The raw body.** The HMAC is over the exact bytes sent. Parsing first and
 *    re-serialising reorders keys and changes the digest, so the body is read as
 *    text and only parsed after it has been verified.
 * 3. **Idempotent.** Razorpay delivers at least once and retries anything that
 *    is not 2xx. Every effect here is keyed so a repeat is a no-op.
 * 4. **2xx for anything it will not act on.** An unknown event answered with an
 *    error is retried forever and eventually gets the endpoint disabled — taking
 *    the events we *do* care about down with it.
 */

/**
 * `force-dynamic`, because a cached webhook endpoint is one that stops
 * receiving webhooks. POST handlers are not cached in this version, so this is
 * belt and braces — the cost of being wrong here is silent and total.
 */
export const dynamic = "force-dynamic";

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; error_description?: string } };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
  };
};

export async function POST(req: Request) {
  // ── 1. Raw bytes, before anything parses them ──────────────────────────
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!isWebhookConfigured()) {
    /**
     * Refused rather than waved through.
     *
     * A deployment with no webhook secret cannot tell a real delivery from a
     * forged one, and an unverified request that credits a wallet is an open
     * door to free money. 503 also makes Razorpay retry, so the payments that
     * arrive during a misconfiguration are not lost once it is fixed.
     */
    console.error("[razorpay] webhook received but RAZORPAY_WEBHOOK_SECRET is not set");
    return new Response("webhook not configured", { status: 503 });
  }

  if (!verifyWebhookSignature(raw, signature)) {
    // Deliberately terse, and a 400 rather than a 401: there is no credential to
    // re-present, and an attacker probing this endpoint learns nothing from it.
    return new Response("invalid signature", { status: 400 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(raw) as WebhookPayload;
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  const event = body.event ?? "";

  if (!isHandledEvent(event)) {
    // Acknowledged, not acted on. See (4) above.
    return Response.json({ received: true, handled: false });
  }

  /**
   * Acknowledge first, work afterwards.
   *
   * Razorpay times out a webhook that takes too long and retries it, so doing
   * the settlement inline would turn one slow Razorpay API call into a duplicate
   * delivery. `after()` runs the work once the response has been sent; the work
   * is idempotent, so a retry that arrives anyway still costs nothing.
   */
  after(async () => {
    try {
      await handle(event, body);
    } catch (err) {
      // Swallowed on purpose: the response has already gone. Losing this would
      // be invisible, so it is logged loudly and reconciliation is the backstop.
      console.error(`[razorpay] webhook ${event} failed:`, err);
    }
  });

  return Response.json({ received: true, handled: true });
}

async function handle(event: string, body: WebhookPayload): Promise<void> {
  await connectDB();

  switch (event) {
    case "payment.captured":
    case "order.paid": {
      const payment = body.payload?.payment?.entity;
      if (!payment?.id || !payment.order_id) return;

      const result = await settlePayment({
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        via: "webhook",
      });

      if (!result.ok) {
        console.error(`[razorpay] could not settle ${payment.id}: ${result.code}`);
      }
      return;
    }

    case "payment.failed": {
      const payment = body.payload?.payment?.entity;
      if (!payment?.order_id) return;

      /**
       * Never over a paid order.
       *
       * A student whose first card is declined and whose second succeeds
       * generates both events, and they can arrive in either order. `$nin` makes
       * the write conditional on the order not already being settled rather than
       * trusting the sequence.
       */
      await PaymentOrder.updateOne(
        { razorpayOrderId: payment.order_id, status: { $nin: ["paid", "expired"] } },
        {
          $set: {
            status: "failed",
            failureReason: payment.error_description ?? "Payment failed",
          },
        }
      );
      return;
    }

    case "refund.processed": {
      const refund = body.payload?.refund?.entity;
      if (!refund?.id || !refund.payment_id || !refund.amount) return;

      const order = await PaymentOrder.findOne({ razorpayPaymentId: refund.payment_id });
      if (!order) return;

      /**
       * The wallet is debited **here**, when the refund actually processes —
       * not when it was requested.
       *
       * A refund can be requested and then fail at the bank. Debiting on request
       * would leave a student short of money that never left, and the reversal
       * would be a second manual step somebody has to remember.
       */
      await debitForRefund({
        userId: String(order.userId),
        amountPaise: refund.amount,
        idempotencyKey: refundKeyFor(refund.id),
        refundId: refund.id,
        orderId: String(order._id),
        reason: "Refund processed by Razorpay",
      });

      await PaymentOrder.updateOne(
        { _id: order._id, "refunds.razorpayRefundId": refund.id },
        { $set: { "refunds.$.status": "processed" } }
      );
      return;
    }

    case "refund.failed": {
      const refund = body.payload?.refund?.entity;
      if (!refund?.id) return;

      // No ledger movement: nothing was debited on request, so nothing needs
      // putting back.
      await PaymentOrder.updateOne(
        { "refunds.razorpayRefundId": refund.id },
        { $set: { "refunds.$.status": "failed" } }
      );
      return;
    }
  }
}
