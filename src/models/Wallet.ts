import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  CURRENCY,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@/lib/payments/fields";

/**
 * The campus wallet, and the ledger behind it.
 *
 * Two collections, and the split is the whole design:
 *
 * - `WalletTransaction` is an **append-only ledger**. It is what happened, and
 *   nothing ever edits or deletes a row. A correction is another row.
 * - `Wallet.balancePaise` is a **cached total**, maintained by `$inc`. It exists
 *   because "what can I spend" is asked on every page load and summing a
 *   student's whole history to answer it would get slower every term.
 *
 * The balance is therefore derivable and the ledger is authoritative. That
 * ordering matters: if the two ever disagree the ledger wins,
 * `reconcileWallet()` recomputes the cache from it, and no money is lost —
 * whereas a design where the balance *is* the truth has no way back from a
 * single bad write.
 */

// ── Wallet ────────────────────────────────────────────────────────────────

const walletSchema = new Schema(
  {
    /**
     * One wallet per user, not per student profile.
     *
     * A teacher may one day be paid through the same rails, and keying on the
     * profile would mean building a second wallet the day that happens.
     */
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    /**
     * Integer paise. Never rupees, never a float.
     *
     * `min: 0` is a schema-level guarantee that no code path can overdraw: a
     * debit that would go negative fails validation even if the query that
     * should have caught it was written wrongly.
     */
    balancePaise: { type: Number, required: true, default: 0, min: 0 },

    currency: { type: String, default: CURRENCY, enum: [CURRENCY] },

    /**
     * A frozen wallet can still be read and refunded, but not topped up or
     * spent. Used when an account is under review — deleting or zeroing it
     * would destroy the record the review is about.
     */
    status: { type: String, enum: ["active", "frozen"], default: "active", index: true },

    /** Running totals, for the admin list and for the daily cap check. */
    lifetimeCreditedPaise: { type: Number, default: 0, min: 0 },
    lifetimeDebitedPaise: { type: Number, default: 0, min: 0 },

    lastTransactionAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type WalletDoc = InferSchemaType<typeof walletSchema>;

resetModelInDev("Wallet");

export const Wallet: Model<WalletDoc> =
  (mongoose.models.Wallet as Model<WalletDoc>) ||
  mongoose.model<WalletDoc>("Wallet", walletSchema);

// ── Ledger ────────────────────────────────────────────────────────────────

const walletTransactionSchema = new Schema(
  {
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
    /** Denormalised so a per-student query needs no join through the wallet. */
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    type: { type: String, enum: TRANSACTION_TYPES, required: true, index: true },

    /**
     * Signed integer paise: positive credits, negative debits.
     *
     * Signed rather than an unsigned amount beside a direction flag, because
     * then the balance is `sum(amountPaise)` — one expression, impossible to get
     * backwards. A direction stored separately is a second source of truth about
     * which way the money went, and the two can disagree.
     */
    amountPaise: { type: Number, required: true },

    /**
     * The balance after this row was applied.
     *
     * Denormalised on purpose. A statement shows a running balance per line, and
     * computing it on read means re-summing every earlier row for every row on
     * the page. It is also what makes a gap visible during reconciliation.
     */
    balanceAfterPaise: { type: Number, default: null },

    status: { type: String, enum: TRANSACTION_STATUSES, default: "success", index: true },

    /**
     * Set once the cached balance has actually been moved.
     *
     * The write is two steps — insert the row, then `$inc` the wallet — and a
     * process that dies between them leaves a row whose money never landed.
     * Rather than pretend that window does not exist, it is *recorded*: a null
     * here on an old row is exactly what reconciliation looks for.
     *
     * The order is deliberate. Inserting first means a retry collides on the
     * idempotency key and does nothing, so the failure mode is a **missing**
     * credit, which is detectable and recoverable. Incrementing first would make
     * the failure mode a double credit, which is neither.
     */
    appliedAt: { type: Date, default: null },

    /**
     * What makes this row unique in the world.
     *
     * `razorpay:payment:pay_XYZ` for a top-up. Two concurrent webhook
     * deliveries for one payment both try to insert, the unique index lets
     * exactly one through, and the loser reads the winner's row. That is a
     * *database* guarantee rather than a check the caller has to remember, which
     * matters because the caller here is a webhook — the code most likely to be
     * delivered twice.
     */
    idempotencyKey: { type: String, required: true },

    /** What the student sees on their statement. */
    description: { type: String, required: true, maxlength: 200 },

    /** The payment, refund or order this row came from. */
    reference: {
      kind: {
        type: String,
        enum: ["razorpay_payment", "razorpay_refund", "internal", "admin"],
        default: "internal",
      },
      id: { type: String, default: null },
      orderId: { type: Schema.Types.ObjectId, ref: "PaymentOrder", default: null },
    },

    /**
     * Who caused this, when it was not the wallet's owner.
     *
     * An adjustment or a refund is made by an administrator, and a ledger that
     * cannot say which one is a ledger that cannot be audited.
     */
    actorAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    /** Required by the service for `adjustment`; free text for everything else. */
    reason: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true }
);

/**
 * The idempotency guarantee.
 *
 * Unique across the whole collection rather than per wallet: a Razorpay payment
 * id is globally unique, and scoping the index per wallet would let the same
 * payment credit two different wallets if a bug ever mixed up the owner.
 */
walletTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
/** The statement: one student's rows, newest first. */
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
/** Reconciliation: rows whose money never landed. */
walletTransactionSchema.index({ appliedAt: 1, createdAt: 1 });
/** The admin ledger view, filtered by kind. */
walletTransactionSchema.index({ type: 1, createdAt: -1 });

export type WalletTransactionDoc = InferSchemaType<typeof walletTransactionSchema>;

resetModelInDev("WalletTransaction");

export const WalletTransaction: Model<WalletTransactionDoc> =
  (mongoose.models.WalletTransaction as Model<WalletTransactionDoc>) ||
  mongoose.model<WalletTransactionDoc>("WalletTransaction", walletTransactionSchema);
