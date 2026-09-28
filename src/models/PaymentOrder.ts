import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { CURRENCY, ORDER_STATUSES } from "@/lib/payments/fields";

/**
 * A payment we asked Razorpay to collect.
 *
 * This row is the **authority on the amount**, and that is its main job. The
 * browser opens checkout, the browser reports back that it paid, and a webhook
 * says so too — none of those are trusted for how much. The amount is written
 * here when the order is created, server-side, and every later step reads it
 * from this document.
 *
 * Without that, a client that sent `amount` at verification time could pay ₹10
 * and be credited ₹10,000. With it there is nothing to tamper with: the only
 * thing the client sends back is an order id, and an id cannot carry a price.
 *
 * `status` is **our** view, not Razorpay's. `paid` means the wallet has been
 * credited, which is a fact about this system and cannot be copied from a
 * webhook payload.
 */

const refundSchema = new Schema(
  {
    razorpayRefundId: { type: String, required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["pending", "processed", "failed"], default: "pending" },
    reason: { type: String, default: null, maxlength: 500 },
    actorAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },

    /**
     * Razorpay's order id (`order_...`).
     *
     * Unique, because it is what a verification request names. Two rows sharing
     * one would make "which order did they pay" unanswerable.
     */
    razorpayOrderId: { type: String, required: true, unique: true },

    /**
     * Razorpay's payment id (`pay_...`), once there is one.
     *
     * Sparse-unique: most orders never get one, and those that do must not share
     * it. This is the second line of defence behind the ledger's idempotency key
     * — one payment settles one order.
     */
    razorpayPaymentId: { type: String, default: null },

    /** Integer paise. The only figure any later step is allowed to believe. */
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: CURRENCY, enum: [CURRENCY] },

    status: { type: String, enum: ORDER_STATUSES, default: "created", index: true },

    /** Our own reference, sent to Razorpay so their dashboard maps to ours. */
    receipt: { type: String, required: true },

    /**
     * How the payment came to be believed.
     *
     * Kept because the two paths have different trust and different failure
     * modes, and "the webhook never arrived, the browser callback saved us" is
     * something worth being able to see across a month of payments.
     */
    verifiedVia: { type: String, enum: ["callback", "webhook", null], default: null },
    paidAt: { type: Date, default: null },

    /** Razorpay's own words when it fails. Shown to nobody; logged for support. */
    failureReason: { type: String, default: null, maxlength: 500 },

    /** What the payment method turned out to be — card, upi, netbanking. */
    method: { type: String, default: null },

    refunds: { type: [refundSchema], default: [] },

    /**
     * Which key issued this order.
     *
     * A deployment that switches from test to live keys must not then try to
     * verify a live payment against a test order: the signature would fail
     * confusingly rather than obviously. Recording the mode makes the mismatch
     * legible.
     */
    mode: { type: String, enum: ["test", "live"], required: true },

    /** When an unpaid order stops being honoured. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

paymentOrderSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
/** A student's payment history, newest first. */
paymentOrderSchema.index({ userId: 1, createdAt: -1 });
/** The sweep that ages out abandoned orders. */
paymentOrderSchema.index({ status: 1, expiresAt: 1 });

export type PaymentOrderDoc = InferSchemaType<typeof paymentOrderSchema>;

resetModelInDev("PaymentOrder");

export const PaymentOrder: Model<PaymentOrderDoc> =
  (mongoose.models.PaymentOrder as Model<PaymentOrderDoc>) ||
  mongoose.model<PaymentOrderDoc>("PaymentOrder", paymentOrderSchema);
