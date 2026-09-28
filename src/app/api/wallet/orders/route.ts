import { z } from "zod";
import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { consumeRateLimit } from "@/lib/rate-limit";
import { WALLET_LIMITS } from "@/lib/payments/fields";
import { createTopUpOrder } from "@/lib/payments/orders";

/**
 * POST /api/wallet/orders — start a top-up.
 *
 * Returns what Razorpay Checkout needs and nothing more: an order id, the
 * amount, and the **public** key id. The key secret never leaves the server, and
 * there is deliberately no endpoint that would return it.
 *
 * The amount is validated here and written onto our order row, which is the only
 * figure any later step reads. See `orders.ts`.
 */

const schema = z.object({
  /**
   * Paise, as an integer.
   *
   * Rupees would arrive as a float and `199.99` would have to be rounded on the
   * server, which is a rounding decision made on the wrong side of the wire.
   * An integer count of the smallest unit has no such ambiguity.
   */
  amountPaise: z
    .number()
    .int("Enter a whole amount")
    .min(WALLET_LIMITS.minTopUpPaise)
    .max(WALLET_LIMITS.maxTopUpPaise),
});

export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    /**
     * Rate limited per user.
     *
     * Not to stop fraud — Razorpay handles that — but because each call creates
     * a real order on a third-party account, and a loop here would fill the
     * Razorpay dashboard with thousands of abandoned orders and eat the API
     * quota that real payments need.
     */
    const limit = await consumeRateLimit(`wallet:order:${session.sub}`, {
      limit: WALLET_LIMITS.ordersPerHour,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return fail("Too many payment attempts. Please wait a few minutes.", 429, {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("Enter a valid amount", 422, parsed.error.issues);
    }

    await connectDB();
    const user = await User.findById(session.sub).select("name email").lean();
    if (!user) return fail("Account not found", 404);

    const result = await createTopUpOrder({
      userId: session.sub,
      amountPaise: parsed.data.amountPaise,
      name: user.name,
      email: user.email,
    });

    if (!result.ok) {
      /**
       * 503 when the deployment has no keys, 422 when the request itself is the
       * problem. The distinction is what tells a student "try later" apart from
       * "try something else".
       */
      return fail(result.message, result.code === "not-configured" ? 503 : 422, {
        code: result.code,
      });
    }

    return ok({
      orderId: result.orderId,
      razorpayOrderId: result.razorpayOrderId,
      amountPaise: result.amountPaise,
      currency: result.currency,
      keyId: result.keyId,
      mode: result.mode,
      /** Prefilled into checkout so the student does not retype what we know. */
      prefill: { name: user.name, email: user.email },
    });
  } catch (err) {
    return handleError(err);
  }
}
