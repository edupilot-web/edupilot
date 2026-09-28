import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { PaymentOrder } from "@/models/PaymentOrder";
import {
  ORDER_TTL_MINUTES,
  WALLET_LIMITS,
  creditKeyFor,
  formatPaise,
  isTerminalOrder,
  isValidPaise,
  type OrderStatus,
} from "@/lib/payments/fields";
import {
  createOrder,
  fetchPayment,
  mode,
  verifyCheckoutSignature,
  PaymentError,
} from "@/lib/payments/razorpay";
import { creditTopUp, getOrCreateWallet, toppedUpTodayPaise } from "@/lib/payments/wallet";

/**
 * Creating a top-up order, and settling it.
 *
 * The rule the whole file exists to hold: **the amount is decided once, here,
 * when the order is created, and every later step reads it back from our own
 * row.** Nothing a browser or a webhook sends is ever believed about how much
 * money changed hands. A client that could send an amount at verification time
 * could pay ₹10 and be credited ₹10,000, and no signature check would catch it
 * — the signature is over ids, not amounts.
 */

export type CreateOrderResult =
  | {
      ok: true;
      orderId: string;
      razorpayOrderId: string;
      amountPaise: number;
      currency: string;
      keyId: string;
      mode: "test" | "live";
    }
  | { ok: false; code: string; message: string };

export async function createTopUpOrder(input: {
  userId: string;
  amountPaise: number;
  name: string;
  email: string;
}): Promise<CreateOrderResult> {
  await connectDB();

  if (!isValidPaise(input.amountPaise)) {
    return { ok: false, code: "invalid-amount", message: "Enter a valid amount." };
  }
  if (input.amountPaise < WALLET_LIMITS.minTopUpPaise) {
    return {
      ok: false,
      code: "below-minimum",
      message: `The smallest top-up is ${formatPaise(WALLET_LIMITS.minTopUpPaise)}.`,
    };
  }
  if (input.amountPaise > WALLET_LIMITS.maxTopUpPaise) {
    return {
      ok: false,
      code: "above-maximum",
      message: `The largest single top-up is ${formatPaise(WALLET_LIMITS.maxTopUpPaise)}.`,
    };
  }

  const wallet = await getOrCreateWallet(input.userId);

  if (wallet.status === "frozen") {
    return { ok: false, code: "frozen", message: "This wallet is on hold. Contact support." };
  }
  if (wallet.balancePaise + input.amountPaise > WALLET_LIMITS.maxBalancePaise) {
    return {
      ok: false,
      code: "balance-cap",
      message: `Your wallet cannot hold more than ${formatPaise(WALLET_LIMITS.maxBalancePaise)}.`,
    };
  }

  /**
   * The daily cap, checked against the ledger rather than against orders.
   *
   * Orders are cheap to create and most are abandoned; counting them would let
   * a student who opened and closed checkout ten times be locked out having
   * spent nothing.
   */
  const today = await toppedUpTodayPaise(input.userId);
  if (today + input.amountPaise > WALLET_LIMITS.maxDailyTopUpPaise) {
    return {
      ok: false,
      code: "daily-cap",
      message: `You can add up to ${formatPaise(WALLET_LIMITS.maxDailyTopUpPaise)} a day. You have added ${formatPaise(today)} today.`,
    };
  }

  /**
   * Our receipt id, generated before the call.
   *
   * Razorpay caps `receipt` at 40 characters, so this is not the Mongo id plus
   * context — it is short and unique on its own, and the mapping back lives on
   * our row.
   */
  const receipt = `wal_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

  let order;
  try {
    order = await createOrder({
      amountPaise: input.amountPaise,
      receipt,
      /**
       * Notes are for the Razorpay dashboard, so a finance question can be
       * answered without opening this app. Deliberately not the email — the
       * dashboard is a third-party surface and the user id is enough to join on.
       */
      notes: { userId: input.userId, purpose: "wallet_topup" },
    });
  } catch (err) {
    if (err instanceof PaymentError) {
      return {
        ok: false,
        code: err.code,
        message:
          err.code === "not-configured"
            ? "Payments are not set up on this deployment yet."
            : "We could not start the payment. Please try again in a moment.",
      };
    }
    throw err;
  }

  const row = await PaymentOrder.create({
    userId: new Types.ObjectId(input.userId),
    walletId: wallet._id,
    razorpayOrderId: order.id,
    // From our validated input, not from the response: they agree, and if they
    // ever did not, ours is the figure the student was shown and agreed to.
    amountPaise: input.amountPaise,
    receipt,
    status: "created",
    mode: mode(),
    expiresAt: new Date(Date.now() + ORDER_TTL_MINUTES * 60_000),
  });

  return {
    ok: true,
    orderId: String(row._id),
    razorpayOrderId: order.id,
    amountPaise: input.amountPaise,
    currency: order.currency,
    // Public by design: Razorpay Checkout needs it in the browser to name the
    // account. It is not a credential and cannot authorise anything on its own.
    keyId: process.env.RAZORPAY_KEY_ID!.trim(),
    mode: mode(),
  };
}

// ── Settlement ────────────────────────────────────────────────────────────

export type SettleResult =
  | { ok: true; balancePaise: number; creditedPaise: number; alreadyCredited: boolean }
  | { ok: false; code: string; message: string };

/**
 * Credit a wallet for a payment, from either path.
 *
 * The browser callback and the webhook both end here, and that is the point:
 * one place decides what a settled payment means, so the two cannot disagree
 * about it. Both are idempotent, because both can happen for the same payment —
 * a student who pays and stays on the page triggers the callback, and the
 * webhook arrives seconds later saying the same thing.
 *
 * Razorpay is **re-asked** what the payment is worth rather than trusting the
 * message that brought us here. A signature proves the message came from
 * Razorpay; it does not prove the payment is still captured, and a payment can
 * be refunded between a webhook being queued and it arriving.
 */
export async function settlePayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  via: "callback" | "webhook";
}): Promise<SettleResult> {
  await connectDB();

  const order = await PaymentOrder.findOne({ razorpayOrderId: input.razorpayOrderId });
  if (!order) {
    return { ok: false, code: "unknown-order", message: "That payment does not match an order." };
  }

  /**
   * A payment id may settle exactly one order.
   *
   * Without this, a replayed message naming a real payment and a *different*
   * real order would credit twice — once per order — and each credit would look
   * perfectly legitimate on its own, because the ledger's idempotency key is
   * per payment and would only stop the second if the order matched.
   */
  if (order.razorpayPaymentId && order.razorpayPaymentId !== input.razorpayPaymentId) {
    return {
      ok: false,
      code: "payment-mismatch",
      message: "That payment belongs to a different order.",
    };
  }

  let payment;
  try {
    payment = await fetchPayment(input.razorpayPaymentId);
  } catch (err) {
    if (err instanceof PaymentError && err.retryable) {
      // Worth another delivery. A webhook returning non-2xx is retried by
      // Razorpay, which is exactly what should happen here.
      return { ok: false, code: "retry", message: "Could not confirm the payment yet." };
    }
    return { ok: false, code: "unverifiable", message: "That payment could not be confirmed." };
  }

  if (payment.order_id !== order.razorpayOrderId) {
    return { ok: false, code: "payment-mismatch", message: "That payment belongs to a different order." };
  }

  if (payment.status === "failed") {
    await markOrder(order.razorpayOrderId, "failed", {
      failureReason: payment.error_description ?? payment.error_reason ?? "Payment failed",
      razorpayPaymentId: payment.id,
    });
    return { ok: false, code: "failed", message: "That payment did not go through." };
  }

  if (payment.status !== "captured") {
    // `created` or `authorized`. Auto-capture means this resolves on its own
    // within seconds, so it is a retry rather than a failure.
    return { ok: false, code: "retry", message: "That payment has not settled yet." };
  }

  /**
   * The amount is **ours**, not Razorpay's — with a mismatch treated as fatal.
   *
   * They should be equal; Razorpay is told the amount at order creation and
   * will not capture a different one. If they ever are not, something is wrong
   * enough that crediting either figure is the wrong move.
   */
  if (payment.amount !== order.amountPaise) {
    await markOrder(order.razorpayOrderId, "failed", {
      failureReason: `Amount mismatch: captured ${payment.amount}, ordered ${order.amountPaise}`,
      razorpayPaymentId: payment.id,
    });
    return { ok: false, code: "amount-mismatch", message: "That payment could not be confirmed." };
  }

  const credit = await creditTopUp({
    userId: String(order.userId),
    amountPaise: order.amountPaise,
    idempotencyKey: creditKeyFor(payment.id),
    paymentId: payment.id,
    orderId: String(order._id),
    method: payment.method ?? null,
  });

  if (!credit.ok) {
    return { ok: false, code: credit.code, message: credit.message };
  }

  await markOrder(order.razorpayOrderId, "paid", {
    razorpayPaymentId: payment.id,
    verifiedVia: input.via,
    method: payment.method ?? null,
    paidAt: new Date(),
  });

  return {
    ok: true,
    balancePaise: credit.balancePaise,
    creditedPaise: order.amountPaise,
    alreadyCredited: credit.duplicate,
  };
}

/**
 * Move an order's status, never backwards.
 *
 * Webhooks arrive out of order: `payment.failed` for a first attempt can land
 * after `payment.captured` for the retry that succeeded. Applying it would mark
 * a paid order failed, and a student would be told their money vanished.
 */
async function markOrder(
  razorpayOrderId: string,
  status: OrderStatus,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await PaymentOrder.updateOne(
    {
      razorpayOrderId,
      status: { $nin: isTerminalOrder(status) ? ["paid"] : ["paid", "failed", "expired"] },
    },
    { $set: { status, ...extra } }
  );
}

/**
 * The browser's report that it paid.
 *
 * The signature is checked **first and on its own**: it is what makes anything
 * the browser says worth acting on, and a request that fails it should not reach
 * the database at all.
 */
export async function verifyCheckout(input: {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<SettleResult> {
  if (
    !verifyCheckoutSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.signature,
    })
  ) {
    return { ok: false, code: "bad-signature", message: "That payment could not be verified." };
  }

  await connectDB();

  /**
   * The order must be this student's.
   *
   * The signature proves Razorpay saw the payment; it says nothing about who is
   * asking. Without this check a student holding one valid signature could
   * settle it against someone else's session — and since settlement credits the
   * *order owner*, the effect would be to leak that another student had paid.
   */
  const order = await PaymentOrder.findOne({ razorpayOrderId: input.razorpayOrderId })
    .select("userId")
    .lean();

  if (!order || String(order.userId) !== input.userId) {
    return { ok: false, code: "unknown-order", message: "That payment does not match an order." };
  }

  return settlePayment({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    via: "callback",
  });
}

/** Age out orders nobody paid, so the list means something. */
export async function expireStaleOrders(): Promise<number> {
  await connectDB();
  const result = await PaymentOrder.updateMany(
    { status: { $in: ["created", "attempted"] }, expiresAt: { $lt: new Date() } },
    { $set: { status: "expired" } }
  );
  return result.modifiedCount;
}
