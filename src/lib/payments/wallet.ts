import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Wallet, WalletTransaction, type WalletDoc } from "@/models/Wallet";
import {
  TRANSACTION_TYPE_LABELS,
  WALLET_LIMITS,
  type TransactionType,
} from "@/lib/payments/fields";

/**
 * The ledger.
 *
 * Every rupee that moves goes through `postTransaction`, and everything else
 * here is a thin wrapper that decides the sign and the description. One entry
 * point, because the two invariants below have to hold for *every* movement and
 * a second write path is how one of them ends up not holding:
 *
 * 1. **A credit lands at most once**, however many times we are told about it.
 * 2. **A debit cannot overdraw**, however many run at once.
 *
 * Neither is enforced by a check-then-write. Both are enforced by the database:
 * the first by a unique index, the second by making the balance condition part
 * of the update's filter.
 */

export type PostResult =
  | { ok: true; balancePaise: number; transactionId: string; duplicate: boolean }
  | { ok: false; code: "insufficient-funds" | "frozen" | "limit-exceeded"; message: string };

export async function getOrCreateWallet(userId: string): Promise<WalletDoc & { _id: Types.ObjectId }> {
  await connectDB();

  /**
   * Upsert rather than find-then-create.
   *
   * Two requests from one student arriving together would both find nothing and
   * both insert; the unique index on `userId` means one of them would throw. The
   * upsert makes the race a non-event.
   */
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId: new Types.ObjectId(userId), balancePaise: 0 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return wallet as WalletDoc & { _id: Types.ObjectId };
}

/**
 * Move money, once.
 *
 * `amountPaise` is **signed**: positive credits, negative debits. The sign is
 * the direction, so there is no second field that could contradict it.
 *
 * The sequence is deliberate and the order is the safety property:
 *
 * 1. Insert the ledger row, unapplied. The unique index on `idempotencyKey`
 *    rejects a repeat, and a rejection here means the money already moved — so
 *    the caller is told `duplicate: true` and nothing else happens.
 * 2. Move the cached balance with `$inc`, conditionally for a debit.
 * 3. Mark the row applied, with the resulting balance.
 *
 * A crash between 1 and 2 leaves a row whose money never landed. That is
 * recoverable — `reconcileWallet` finds it by `appliedAt: null` and applies it —
 * and it is recoverable *because* of the order. Incrementing first would make
 * the crash window a double credit instead, which nothing can detect after the
 * fact.
 */
export async function postTransaction(input: {
  userId: string;
  type: TransactionType;
  /** Signed. Positive credits, negative debits. */
  amountPaise: number;
  idempotencyKey: string;
  description?: string;
  reference?: { kind: "razorpay_payment" | "razorpay_refund" | "internal" | "admin"; id?: string | null; orderId?: string | null };
  actorAdminId?: string | null;
  reason?: string | null;
  /** Skips the frozen check. Only a refund may move a frozen wallet. */
  allowFrozen?: boolean;
}): Promise<PostResult> {
  await connectDB();

  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise === 0) {
    throw new RangeError("amountPaise must be a non-zero safe integer of paise");
  }

  const wallet = await getOrCreateWallet(input.userId);

  if (wallet.status === "frozen" && !input.allowFrozen) {
    return { ok: false, code: "frozen", message: "This wallet is on hold. Contact support." };
  }

  const credit = input.amountPaise > 0;

  // The holding cap, checked before anything is written so a rejected top-up
  // leaves no trace.
  if (credit && wallet.balancePaise + input.amountPaise > WALLET_LIMITS.maxBalancePaise) {
    return {
      ok: false,
      code: "limit-exceeded",
      message: "This would take your wallet over its maximum balance.",
    };
  }

  // ── 1. The ledger row ───────────────────────────────────────────────────
  let transactionId: Types.ObjectId;
  try {
    const row = await WalletTransaction.create({
      walletId: wallet._id,
      userId: new Types.ObjectId(input.userId),
      type: input.type,
      amountPaise: input.amountPaise,
      status: "success",
      appliedAt: null,
      idempotencyKey: input.idempotencyKey,
      description: input.description ?? TRANSACTION_TYPE_LABELS[input.type],
      reference: {
        kind: input.reference?.kind ?? "internal",
        id: input.reference?.id ?? null,
        orderId: input.reference?.orderId ? new Types.ObjectId(input.reference.orderId) : null,
      },
      actorAdminId: input.actorAdminId ? new Types.ObjectId(input.actorAdminId) : null,
      reason: input.reason ?? null,
    });
    transactionId = row._id;
  } catch (err) {
    if (isDuplicateKey(err)) {
      /**
       * Already done. The expected case on a webhook retry, not an error.
       *
       * The existing row is read back so the caller gets a real balance and a
       * real id — a retry should look exactly like the first delivery from the
       * outside, or callers start treating "duplicate" as a failure.
       */
      const existing = await WalletTransaction.findOne({ idempotencyKey: input.idempotencyKey })
        .select("_id")
        .lean();
      const current = await Wallet.findById(wallet._id).select("balancePaise").lean();

      return {
        ok: true,
        balancePaise: current?.balancePaise ?? wallet.balancePaise,
        transactionId: String(existing?._id ?? ""),
        duplicate: true,
      };
    }
    throw err;
  }

  // ── 2. The cached balance ───────────────────────────────────────────────
  /**
   * A debit carries its own guard **inside the filter**.
   *
   * `balancePaise: { $gte: -amount }` makes "check the balance" and "reduce the
   * balance" one atomic operation. Reading the balance and then updating it
   * would let two concurrent spends of ₹60 both pass a ₹100 check and leave the
   * wallet at −₹20.
   */
  const filter: Record<string, unknown> = { _id: wallet._id };
  if (!credit) filter.balancePaise = { $gte: -input.amountPaise };

  const updated = await Wallet.findOneAndUpdate(
    filter,
    {
      $inc: {
        balancePaise: input.amountPaise,
        ...(credit
          ? { lifetimeCreditedPaise: input.amountPaise }
          : { lifetimeDebitedPaise: -input.amountPaise }),
      },
      $set: { lastTransactionAt: new Date() },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    /**
     * The filter matched nothing, which for a debit means the balance moved
     * under us and there is no longer enough.
     *
     * The row is marked failed rather than deleted: an attempted debit that
     * could not be met is something a student may well ask about, and a ledger
     * that quietly forgets its refusals cannot answer.
     */
    await WalletTransaction.updateOne(
      { _id: transactionId },
      { $set: { status: "failed", reason: input.reason ?? "Insufficient balance" } }
    );

    return {
      ok: false,
      code: "insufficient-funds",
      message: "There is not enough in your wallet for this.",
    };
  }

  // ── 3. Mark it landed ───────────────────────────────────────────────────
  await WalletTransaction.updateOne(
    { _id: transactionId },
    { $set: { appliedAt: new Date(), balanceAfterPaise: updated.balancePaise } }
  );

  return {
    ok: true,
    balancePaise: updated.balancePaise,
    transactionId: String(transactionId),
    duplicate: false,
  };
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

// ── The movements ─────────────────────────────────────────────────────────

/** Money in from a settled Razorpay payment. */
export async function creditTopUp(input: {
  userId: string;
  amountPaise: number;
  idempotencyKey: string;
  paymentId: string;
  orderId: string;
  method?: string | null;
}): Promise<PostResult> {
  return postTransaction({
    userId: input.userId,
    type: "topup",
    amountPaise: input.amountPaise,
    idempotencyKey: input.idempotencyKey,
    description: `Money added${input.method ? ` via ${input.method.toUpperCase()}` : ""}`,
    reference: { kind: "razorpay_payment", id: input.paymentId, orderId: input.orderId },
  });
}

/**
 * Money out, for a campus service.
 *
 * Exported and generic rather than tied to a caller, because this is the
 * primitive every future spend goes through — a canteen till, a library fine, a
 * hostel fee. `idempotencyKey` is the caller's to choose and is what stops a
 * double-tapped pay button charging twice.
 */
export async function debitWallet(input: {
  userId: string;
  amountPaise: number;
  idempotencyKey: string;
  description: string;
}): Promise<PostResult> {
  return postTransaction({
    userId: input.userId,
    type: "spend",
    amountPaise: -Math.abs(input.amountPaise),
    idempotencyKey: input.idempotencyKey,
    description: input.description,
  });
}

/**
 * Money back to the card, reversing a top-up.
 *
 * A **debit** of the wallet: the rupees are leaving it to go back where they
 * came from. Allowed on a frozen wallet, because returning money is not
 * something a hold should prevent — a hold exists to stop new spending.
 */
export async function debitForRefund(input: {
  userId: string;
  amountPaise: number;
  idempotencyKey: string;
  refundId: string;
  orderId: string;
  actorAdminId?: string | null;
  reason?: string | null;
}): Promise<PostResult> {
  return postTransaction({
    userId: input.userId,
    type: "refund",
    amountPaise: -Math.abs(input.amountPaise),
    idempotencyKey: input.idempotencyKey,
    description: "Refunded to your bank",
    reference: { kind: "razorpay_refund", id: input.refundId, orderId: input.orderId },
    actorAdminId: input.actorAdminId ?? null,
    reason: input.reason ?? null,
    allowFrozen: true,
  });
}

/**
 * An administrator moving the balance by hand.
 *
 * `reason` is required by the signature, not merely encouraged: an unexplained
 * adjustment is indistinguishable from a mistake six months later, and this is
 * the one movement with no external record behind it.
 */
export async function adjustWallet(input: {
  userId: string;
  /** Signed. Positive gives money, negative takes it. */
  amountPaise: number;
  reason: string;
  actorAdminId: string;
  idempotencyKey: string;
}): Promise<PostResult> {
  return postTransaction({
    userId: input.userId,
    type: "adjustment",
    amountPaise: input.amountPaise,
    idempotencyKey: input.idempotencyKey,
    description: input.amountPaise > 0 ? "Credit from EduPilot" : "Adjustment",
    reference: { kind: "admin" },
    actorAdminId: input.actorAdminId,
    reason: input.reason,
    allowFrozen: true,
  });
}

// ── Reading ───────────────────────────────────────────────────────────────

export type WalletStatement = {
  balancePaise: number;
  status: "active" | "frozen";
  transactions: {
    id: string;
    type: TransactionType;
    label: string;
    description: string;
    amountPaise: number;
    balanceAfterPaise: number | null;
    status: string;
    createdAt: string;
  }[];
  nextCursor: string | null;
};

export async function getStatement(
  userId: string,
  options: { limit?: number; cursor?: string | null } = {}
): Promise<WalletStatement> {
  await connectDB();

  const wallet = await getOrCreateWallet(userId);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  /**
   * Cursor pagination on `createdAt`, not `skip`.
   *
   * A statement grows at the top, so an offset shifts under the reader every
   * time a payment lands and page two silently repeats a row from page one.
   */
  const filter: Record<string, unknown> = { userId };
  if (options.cursor) {
    const at = new Date(options.cursor);
    if (!Number.isNaN(at.getTime())) filter.createdAt = { $lt: at };
  }

  const rows = await WalletTransaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const page = rows.slice(0, limit);

  return {
    balancePaise: wallet.balancePaise,
    status: wallet.status as "active" | "frozen",
    transactions: page.map((row) => ({
      id: String(row._id),
      type: row.type as TransactionType,
      label: TRANSACTION_TYPE_LABELS[row.type as TransactionType],
      description: row.description,
      amountPaise: row.amountPaise,
      balanceAfterPaise: row.balanceAfterPaise ?? null,
      status: row.status,
      createdAt: (row.createdAt as Date).toISOString(),
    })),
    nextCursor:
      rows.length > limit ? (page.at(-1)!.createdAt as Date).toISOString() : null,
  };
}

/** What a student has topped up today, for the daily cap. */
export async function toppedUpTodayPaise(userId: string): Promise<number> {
  await connectDB();

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const [row] = await WalletTransaction.aggregate<{ total: number }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        type: "topup",
        status: "success",
        createdAt: { $gte: midnight },
      },
    },
    { $group: { _id: null, total: { $sum: "$amountPaise" } } },
  ]);

  return row?.total ?? 0;
}

// ── Reconciliation ────────────────────────────────────────────────────────

export type ReconcileReport = {
  walletsChecked: number;
  applied: number;
  corrected: { userId: string; cachedPaise: number; ledgerPaise: number }[];
};

/**
 * Make the cached balance agree with the ledger.
 *
 * Two jobs, and the first is the one that matters:
 *
 * 1. **Apply stranded rows.** A row with `appliedAt: null` older than the grace
 *    period is money that was recorded but never moved — the crash window in
 *    `postTransaction`. Applying it is what makes that window recoverable rather
 *    than a quiet shortfall.
 * 2. **Re-sum.** The ledger is authoritative, so any disagreement is resolved by
 *    recomputing the cache from it. This should find nothing; it existing is how
 *    we would know if it did not.
 *
 * Meant to run on a schedule, and safe to run at any time: it is idempotent and
 * takes no locks. The grace period keeps it clear of transactions that are
 * merely in flight right now.
 */
export async function reconcileWallets(
  options: { graceMinutes?: number; userId?: string } = {}
): Promise<ReconcileReport> {
  await connectDB();

  const cutoff = new Date(Date.now() - (options.graceMinutes ?? 10) * 60_000);
  const scope = options.userId ? { userId: new Types.ObjectId(options.userId) } : {};

  // 1. Stranded rows.
  const stranded = await WalletTransaction.find({
    ...scope,
    appliedAt: null,
    status: "success",
    createdAt: { $lt: cutoff },
  }).lean();

  for (const row of stranded) {
    const credit = row.amountPaise > 0;
    const filter: Record<string, unknown> = { _id: row.walletId };
    if (!credit) filter.balancePaise = { $gte: -row.amountPaise };

    const updated = await Wallet.findOneAndUpdate(
      filter,
      {
        $inc: {
          balancePaise: row.amountPaise,
          ...(credit
            ? { lifetimeCreditedPaise: row.amountPaise }
            : { lifetimeDebitedPaise: -row.amountPaise }),
        },
      },
      { returnDocument: "after" }
    ).lean();

    await WalletTransaction.updateOne(
      { _id: row._id },
      updated
        ? { $set: { appliedAt: new Date(), balanceAfterPaise: updated.balancePaise } }
        : { $set: { status: "failed", reason: "Could not be applied during reconciliation" } }
    );
  }

  // 2. Re-sum against the ledger.
  const totals = await WalletTransaction.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { ...scope, status: "success", appliedAt: { $ne: null } } },
    { $group: { _id: "$walletId", total: { $sum: "$amountPaise" } } },
  ]);

  const byWallet = new Map(totals.map((row) => [String(row._id), row.total]));
  const wallets = await Wallet.find(options.userId ? scope : {}).lean();
  const corrected: ReconcileReport["corrected"] = [];

  for (const wallet of wallets) {
    const ledger = byWallet.get(String(wallet._id)) ?? 0;
    if (ledger === wallet.balancePaise) continue;

    corrected.push({
      userId: String(wallet.userId),
      cachedPaise: wallet.balancePaise,
      ledgerPaise: ledger,
    });

    await Wallet.updateOne({ _id: wallet._id }, { $set: { balancePaise: Math.max(ledger, 0) } });
  }

  return { walletsChecked: wallets.length, applied: stranded.length, corrected };
}
