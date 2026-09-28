import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { PaymentOrder } from "@/models/PaymentOrder";
import { User } from "@/models/User";
import { Wallet, WalletTransaction } from "@/models/Wallet";
import { refundKeyFor, type TransactionType } from "@/lib/payments/fields";
import { createRefund, PaymentError } from "@/lib/payments/razorpay";

/**
 * The administrator's view of payments, and the two things they can do to one.
 *
 * Reading is deliberately separate from `wallet.ts`: that file is the ledger
 * primitive every movement goes through, and mixing "show me a table" into it
 * would put a query with a `search` parameter next to the code that moves money.
 */

export type LedgerRow = {
  id: string;
  userId: string;
  studentName: string | null;
  studentEmail: string | null;
  type: TransactionType;
  description: string;
  amountPaise: number;
  balanceAfterPaise: number | null;
  status: string;
  reference: { kind: string; id: string | null };
  /** Null on rows the student caused themselves. */
  actorAdminId: string | null;
  reason: string | null;
  createdAt: string;
};

export async function listLedger(options: {
  type?: string | null;
  userId?: string | null;
  search?: string | null;
  limit?: number;
  skip?: number;
}): Promise<{ rows: LedgerRow[]; total: number; totals: { creditedPaise: number; debitedPaise: number } }> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (options.type) filter.type = options.type;
  if (options.userId && Types.ObjectId.isValid(options.userId)) {
    filter.userId = new Types.ObjectId(options.userId);
  }

  /**
   * A search resolves to user ids first.
   *
   * The ledger has no name on it — denormalising one would mean a row whose
   * label goes stale the moment somebody changes their name, on the collection
   * that must stay truthful longest.
   */
  if (options.search?.trim()) {
    const pattern = new RegExp(escapeRegex(options.search.trim()), "i");
    const users = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .select("_id")
      .limit(200)
      .lean();
    filter.userId = { $in: users.map((user) => user._id) };
  }

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);

  const [rows, total, sums] = await Promise.all([
    WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WalletTransaction.countDocuments(filter),
    WalletTransaction.aggregate<{ _id: null; credited: number; debited: number }>([
      { $match: { ...filter, status: "success" } },
      {
        $group: {
          _id: null,
          credited: { $sum: { $cond: [{ $gt: ["$amountPaise", 0] }, "$amountPaise", 0] } },
          debited: { $sum: { $cond: [{ $lt: ["$amountPaise", 0] }, "$amountPaise", 0] } },
        },
      },
    ]),
  ]);

  const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } })
    .select("name email")
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));

  return {
    rows: rows.map((row) => {
      const user = byId.get(String(row.userId));
      return {
        id: String(row._id),
        userId: String(row.userId),
        studentName: user?.name ?? null,
        studentEmail: user?.email ?? null,
        type: row.type as TransactionType,
        description: row.description,
        amountPaise: row.amountPaise,
        balanceAfterPaise: row.balanceAfterPaise ?? null,
        status: row.status,
        reference: { kind: row.reference?.kind ?? "internal", id: row.reference?.id ?? null },
        actorAdminId: row.actorAdminId ? String(row.actorAdminId) : null,
        reason: row.reason ?? null,
        createdAt: (row.createdAt as Date).toISOString(),
      };
    }),
    total,
    totals: {
      creditedPaise: sums[0]?.credited ?? 0,
      debitedPaise: Math.abs(sums[0]?.debited ?? 0),
    },
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Refunds ───────────────────────────────────────────────────────────────

export type RefundResult =
  | { ok: true; refundId: string; amountPaise: number }
  | { ok: false; code: string; message: string };

/**
 * Send money back to the card it came from.
 *
 * Refunds a **payment**, not a balance, and the distinction is the whole reason
 * this is careful. Money in a wallet is fungible — a student may have topped up
 * ₹500 and spent ₹400 — so "refund ₹500" has to be checked twice:
 *
 * - against the **payment**, because Razorpay will not return more than was
 *   taken, and
 * - against the **balance**, because returning money that has already been spent
 *   on campus would leave the wallet negative and the platform out of pocket.
 *
 * The wallet is **not** debited here. It is debited when `refund.processed`
 * arrives, because a refund can be requested and then fail at the bank —
 * debiting on request would leave a student short of money that never left.
 */
export async function refundPayment(input: {
  orderId: string;
  amountPaise?: number;
  reason: string;
  actorAdminId: string;
}): Promise<RefundResult> {
  await connectDB();

  if (!Types.ObjectId.isValid(input.orderId)) {
    return { ok: false, code: "not-found", message: "That payment does not exist." };
  }

  const order = await PaymentOrder.findById(input.orderId);
  if (!order) return { ok: false, code: "not-found", message: "That payment does not exist." };

  if (order.status !== "paid" || !order.razorpayPaymentId) {
    return { ok: false, code: "not-refundable", message: "That payment was never settled." };
  }

  const alreadyRefunded = order.refunds
    .filter((refund) => refund.status !== "failed")
    .reduce((sum, refund) => sum + refund.amountPaise, 0);

  const remaining = order.amountPaise - alreadyRefunded;
  const amountPaise = input.amountPaise ?? remaining;

  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    return { ok: false, code: "invalid-amount", message: "Enter a valid refund amount." };
  }
  if (amountPaise > remaining) {
    return {
      ok: false,
      code: "over-refund",
      message: "That is more than is left to refund on this payment.",
    };
  }

  /**
   * The wallet must be able to give it back.
   *
   * Checked before calling Razorpay, because a refund cannot be un-sent: once
   * the money is on its way to the card, a wallet that cannot cover it leaves a
   * negative balance that has to be chased.
   */
  const wallet = await Wallet.findById(order.walletId).select("balancePaise").lean();
  if (!wallet || wallet.balancePaise < amountPaise) {
    return {
      ok: false,
      code: "insufficient-balance",
      message: "The student has already spent this money. It cannot be refunded to the card.",
    };
  }

  let refund;
  try {
    refund = await createRefund({
      paymentId: order.razorpayPaymentId,
      amountPaise,
      notes: { orderId: String(order._id), reason: input.reason.slice(0, 200) },
    });
  } catch (err) {
    if (err instanceof PaymentError) {
      return { ok: false, code: err.code, message: `Razorpay refused the refund. ${err.message}` };
    }
    throw err;
  }

  await PaymentOrder.updateOne(
    { _id: order._id },
    {
      $push: {
        refunds: {
          razorpayRefundId: refund.id,
          amountPaise,
          status: refund.status === "processed" ? "processed" : "pending",
          reason: input.reason,
          actorAdminId: new Types.ObjectId(input.actorAdminId),
          createdAt: new Date(),
        },
      },
    }
  );

  /**
   * Razorpay occasionally processes a refund synchronously.
   *
   * When it does, `refund.processed` may never arrive as a webhook, so the debit
   * is applied here instead. It is the same idempotency key either way, so a
   * webhook that does arrive finds the work already done and changes nothing.
   */
  if (refund.status === "processed") {
    const { debitForRefund } = await import("@/lib/payments/wallet");
    await debitForRefund({
      userId: String(order.userId),
      amountPaise,
      idempotencyKey: refundKeyFor(refund.id),
      refundId: refund.id,
      orderId: String(order._id),
      actorAdminId: input.actorAdminId,
      reason: input.reason,
    });
  }

  return { ok: true, refundId: refund.id, amountPaise };
}

/** Put a wallet on hold, or take it off. Never touches the balance. */
export async function setWalletStatus(
  userId: string,
  status: "active" | "frozen"
): Promise<boolean> {
  await connectDB();
  const result = await Wallet.updateOne({ userId }, { $set: { status } });
  return result.matchedCount > 0;
}
