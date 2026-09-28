import "./test-db";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../../src/lib/db";
import { User } from "../../src/models/User";
import { Wallet, WalletTransaction } from "../../src/models/Wallet";
import {
  adjustWallet,
  creditTopUp,
  debitWallet,
  getOrCreateWallet,
  getStatement,
  postTransaction,
  reconcileWallets,
  toppedUpTodayPaise,
} from "../../src/lib/payments/wallet";
import { creditKeyFor, WALLET_LIMITS } from "../../src/lib/payments/fields";

/**
 * The two invariants a wallet has to hold, against a real database.
 *
 * 1. **A credit lands at most once**, however many times we are told about it.
 * 2. **A debit cannot overdraw**, however many run at once.
 *
 * Neither is a unit test, because neither is enforced in TypeScript. The first
 * is a unique index and the second is a conditional update, so both are
 * properties of MongoDB's behaviour under concurrency — which only a real
 * database can demonstrate.
 */

let userId: string;

before(async () => {
  await connectDB();
  await mongoose.connection.collection("wallets").deleteMany({});
  await mongoose.connection.collection("wallettransactions").deleteMany({});

  const user = await User.create({
    name: "Wallet Test",
    email: `wallet-${Date.now()}@test.local`,
    passwordHash: "x".repeat(60),
    role: "student",
    emailVerified: true,
  });
  userId = String(user._id);

  // The suite asserts on the unique index; without it every duplicate test
  // would pass against a schema whose constraint was never created.
  await Wallet.createIndexes();
  await WalletTransaction.createIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function reset(): Promise<void> {
  await WalletTransaction.deleteMany({ userId });
  await Wallet.updateOne(
    { userId },
    { $set: { balancePaise: 0, status: "active", lifetimeCreditedPaise: 0, lifetimeDebitedPaise: 0 } }
  );
}

describe("crediting", () => {
  it("creates a wallet on first use rather than requiring one", async () => {
    const wallet = await getOrCreateWallet(userId);
    assert.equal(wallet.balancePaise, 0);
    assert.equal(wallet.status, "active");
  });

  it("credits a top-up and records the balance on the row", async () => {
    await reset();

    const result = await creditTopUp({
      userId,
      amountPaise: 50_000,
      idempotencyKey: creditKeyFor("pay_first"),
      paymentId: "pay_first",
      orderId: String(new Types.ObjectId()),
      method: "upi",
    });

    assert.equal(result.ok && result.balancePaise, 50_000);

    const row = await WalletTransaction.findOne({ idempotencyKey: creditKeyFor("pay_first") }).lean();
    assert.equal(row?.amountPaise, 50_000);
    assert.equal(row?.balanceAfterPaise, 50_000);
    // Set only once the cached balance actually moved. A null here is what
    // reconciliation looks for.
    assert.ok(row?.appliedAt, "the row was marked applied");
  });

  /**
   * The one that matters most.
   *
   * Razorpay delivers webhooks at least once and retries anything non-2xx, so
   * "the same payment arrives twice" is the expected case, not an edge case.
   */
  it("credits one payment exactly once, however many times it arrives", async () => {
    await reset();

    const once = () =>
      creditTopUp({
        userId,
        amountPaise: 25_000,
        idempotencyKey: creditKeyFor("pay_retry"),
        paymentId: "pay_retry",
        orderId: String(new Types.ObjectId()),
      });

    const first = await once();
    const second = await once();
    const third = await once();

    assert.equal(first.ok && first.duplicate, false);
    assert.equal(second.ok && second.duplicate, true);
    assert.equal(third.ok && third.duplicate, true);

    const wallet = await Wallet.findOne({ userId }).lean();
    assert.equal(wallet?.balancePaise, 25_000, "credited once, not three times");
    assert.equal(await WalletTransaction.countDocuments({ userId }), 1);
  });

  it("credits once when the same payment arrives concurrently", async () => {
    // The real shape of the race: the browser callback and the webhook landing
    // together. A check-then-write would pass both.
    await reset();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        creditTopUp({
          userId,
          amountPaise: 10_000,
          idempotencyKey: creditKeyFor("pay_concurrent"),
          paymentId: "pay_concurrent",
          orderId: String(new Types.ObjectId()),
        })
      )
    );

    assert.ok(results.every((result) => result.ok));
    assert.equal(results.filter((r) => r.ok && !r.duplicate).length, 1, "exactly one real credit");

    const wallet = await Wallet.findOne({ userId }).lean();
    assert.equal(wallet?.balancePaise, 10_000);
  });

  it("refuses a credit that would breach the holding cap", async () => {
    await reset();
    await Wallet.updateOne({ userId }, { $set: { balancePaise: WALLET_LIMITS.maxBalancePaise } });

    const result = await creditTopUp({
      userId,
      amountPaise: 100_000,
      idempotencyKey: creditKeyFor("pay_over_cap"),
      paymentId: "pay_over_cap",
      orderId: String(new Types.ObjectId()),
    });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "limit-exceeded");
    // Nothing written: a rejected top-up leaves no trace.
    assert.equal(await WalletTransaction.countDocuments({ idempotencyKey: creditKeyFor("pay_over_cap") }), 0);
  });
});

describe("debiting", () => {
  it("spends what is there", async () => {
    await reset();
    await creditTopUp({
      userId,
      amountPaise: 100_000,
      idempotencyKey: creditKeyFor("pay_spend_base"),
      paymentId: "pay_spend_base",
      orderId: String(new Types.ObjectId()),
    });

    const result = await debitWallet({
      userId,
      amountPaise: 30_000,
      idempotencyKey: "canteen:order:1",
      description: "Canteen",
    });

    assert.equal(result.ok && result.balancePaise, 70_000);
  });

  it("refuses to overdraw", async () => {
    await reset();
    await creditTopUp({
      userId,
      amountPaise: 10_000,
      idempotencyKey: creditKeyFor("pay_small"),
      paymentId: "pay_small",
      orderId: String(new Types.ObjectId()),
    });

    const result = await debitWallet({
      userId,
      amountPaise: 50_000,
      idempotencyKey: "canteen:order:too-big",
      description: "Too much",
    });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "insufficient-funds");

    const wallet = await Wallet.findOne({ userId }).lean();
    assert.equal(wallet?.balancePaise, 10_000, "balance untouched");

    /**
     * The refusal is *recorded*, not forgotten.
     *
     * A student whose payment was declined will ask about it, and a ledger that
     * quietly drops its refusals cannot answer.
     */
    const row = await WalletTransaction.findOne({ idempotencyKey: "canteen:order:too-big" }).lean();
    assert.equal(row?.status, "failed");
  });

  /**
   * The race a naive implementation loses.
   *
   * Ten concurrent ₹60 spends against a ₹100 balance. Read-then-write lets
   * several past the check; the balance condition being *inside* the update
   * filter is what makes it one atomic operation.
   */
  it("never lets concurrent debits overdraw", async () => {
    await reset();
    await creditTopUp({
      userId,
      amountPaise: 10_000,
      idempotencyKey: creditKeyFor("pay_race"),
      paymentId: "pay_race",
      orderId: String(new Types.ObjectId()),
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        debitWallet({
          userId,
          amountPaise: 6_000,
          idempotencyKey: `race:${index}`,
          description: "Concurrent spend",
        })
      )
    );

    const succeeded = results.filter((result) => result.ok).length;
    assert.equal(succeeded, 1, "only one ₹60 spend fits in ₹100");

    const wallet = await Wallet.findOne({ userId }).lean();
    assert.equal(wallet?.balancePaise, 4_000);
    assert.ok(wallet!.balancePaise >= 0, "never negative");
  });

  it("does not charge twice for one double-tapped button", async () => {
    await reset();
    await creditTopUp({
      userId,
      amountPaise: 100_000,
      idempotencyKey: creditKeyFor("pay_double"),
      paymentId: "pay_double",
      orderId: String(new Types.ObjectId()),
    });

    const key = "canteen:order:double-tap";
    await debitWallet({ userId, amountPaise: 20_000, idempotencyKey: key, description: "Lunch" });
    const second = await debitWallet({
      userId,
      amountPaise: 20_000,
      idempotencyKey: key,
      description: "Lunch",
    });

    assert.equal(second.ok && second.duplicate, true);
    const wallet = await Wallet.findOne({ userId }).lean();
    assert.equal(wallet?.balancePaise, 80_000, "charged once");
  });
});

describe("frozen wallets", () => {
  it("refuses a top-up but allows a refund", async () => {
    await reset();
    await Wallet.updateOne({ userId }, { $set: { balancePaise: 50_000, status: "frozen" } });

    const topUp = await creditTopUp({
      userId,
      amountPaise: 10_000,
      idempotencyKey: creditKeyFor("pay_frozen"),
      paymentId: "pay_frozen",
      orderId: String(new Types.ObjectId()),
    });
    assert.equal(!topUp.ok && topUp.code, "frozen");

    // Returning money is not something a hold should prevent — a hold exists to
    // stop new spending.
    const refund = await postTransaction({
      userId,
      type: "refund",
      amountPaise: -20_000,
      idempotencyKey: "razorpay:refund:rfnd_1",
      allowFrozen: true,
    });
    assert.equal(refund.ok && refund.balancePaise, 30_000);

    await Wallet.updateOne({ userId }, { $set: { status: "active" } });
  });
});

describe("the statement", () => {
  it("reads newest first and pages by cursor", async () => {
    await reset();

    for (let index = 0; index < 5; index += 1) {
      await creditTopUp({
        userId,
        amountPaise: 1_000,
        idempotencyKey: creditKeyFor(`pay_page_${index}`),
        paymentId: `pay_page_${index}`,
        orderId: String(new Types.ObjectId()),
      });
    }

    const first = await getStatement(userId, { limit: 2 });
    assert.equal(first.transactions.length, 2);
    assert.equal(first.balancePaise, 5_000);
    assert.ok(first.nextCursor);

    const second = await getStatement(userId, { limit: 2, cursor: first.nextCursor });
    assert.equal(second.transactions.length, 2);

    const ids = new Set([...first.transactions, ...second.transactions].map((row) => row.id));
    assert.equal(ids.size, 4, "no row appears on two pages");
  });

  it("counts only today's top-ups against the daily cap", async () => {
    await reset();
    await creditTopUp({
      userId,
      amountPaise: 30_000,
      idempotencyKey: creditKeyFor("pay_today"),
      paymentId: "pay_today",
      orderId: String(new Types.ObjectId()),
    });

    assert.equal(await toppedUpTodayPaise(userId), 30_000);

    // A spend is not a top-up and must not consume the cap.
    await debitWallet({
      userId,
      amountPaise: 5_000,
      idempotencyKey: "spend:not-a-topup",
      description: "Canteen",
    });
    assert.equal(await toppedUpTodayPaise(userId), 30_000);
  });
});

describe("reconciliation", () => {
  /**
   * The crash window, made concrete.
   *
   * A row inserted whose `$inc` never ran is exactly what a process dying
   * between the two writes leaves behind. The ordering means this under-credits
   * rather than double-credits — recoverable, which is the whole point.
   */
  it("applies a row whose money never landed", async () => {
    await reset();
    const wallet = await getOrCreateWallet(userId);

    await WalletTransaction.create({
      walletId: wallet._id,
      userId: new Types.ObjectId(userId),
      type: "topup",
      amountPaise: 40_000,
      status: "success",
      appliedAt: null,
      idempotencyKey: creditKeyFor("pay_stranded"),
      description: "Stranded credit",
      createdAt: new Date(Date.now() - 60 * 60_000),
    });

    const report = await reconcileWallets({ graceMinutes: 10, userId });
    assert.equal(report.applied, 1);

    const after = await Wallet.findOne({ userId }).lean();
    assert.equal(after?.balancePaise, 40_000, "the stranded credit landed");
  });

  it("puts a drifted cache back in step with the ledger", async () => {
    await reset();
    await creditTopUp({
      userId,
      amountPaise: 20_000,
      idempotencyKey: creditKeyFor("pay_drift"),
      paymentId: "pay_drift",
      orderId: String(new Types.ObjectId()),
    });

    // Corrupt the cache the way a partial write would.
    await Wallet.updateOne({ userId }, { $set: { balancePaise: 999_999 } });

    const report = await reconcileWallets({ graceMinutes: 0, userId });
    assert.equal(report.corrected.length, 1);

    const after = await Wallet.findOne({ userId }).lean();
    assert.equal(after?.balancePaise, 20_000, "the ledger wins");
  });

  it("finds nothing to correct on a healthy wallet", async () => {
    await reset();
    await creditTopUp({
      userId,
      amountPaise: 15_000,
      idempotencyKey: creditKeyFor("pay_healthy"),
      paymentId: "pay_healthy",
      orderId: String(new Types.ObjectId()),
    });
    await debitWallet({
      userId,
      amountPaise: 5_000,
      idempotencyKey: "spend:healthy",
      description: "Canteen",
    });

    const report = await reconcileWallets({ graceMinutes: 0, userId });
    assert.equal(report.corrected.length, 0);
    assert.equal(report.applied, 0);
  });
});

describe("adjustments", () => {
  it("records who made it and why", async () => {
    await reset();
    const adminId = String(new Types.ObjectId());

    const result = await adjustWallet({
      userId,
      amountPaise: 5_000,
      reason: "Goodwill credit after a failed canteen order",
      actorAdminId: adminId,
      idempotencyKey: "admin:adjust:1",
    });

    assert.equal(result.ok && result.balancePaise, 5_000);

    const row = await WalletTransaction.findOne({ idempotencyKey: "admin:adjust:1" }).lean();
    assert.equal(String(row?.actorAdminId), adminId);
    assert.match(row?.reason ?? "", /goodwill/i);
  });
});
