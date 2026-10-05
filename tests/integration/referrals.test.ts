import "./test-db";

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../../src/lib/db";
import { User } from "../../src/models/User";
import { StudentProfile } from "../../src/models/StudentProfile";
import { Referral, ReferralCode } from "../../src/models/Referral";
import { Wallet, WalletTransaction } from "../../src/models/Wallet";
import {
  getOrCreateCode,
  getSummary,
  ownerOfCode,
  qualifyReferral,
  recordSignup,
} from "../../src/lib/referrals/service";
import { isWellFormedCode, normaliseCode } from "../../src/lib/referrals/fields";

/**
 * Referrals.
 *
 * Almost every test here is about what does **not** earn a reward. A referral
 * programme is the most reliably abused feature in any product, and the value
 * of the code is in the refusals.
 */

let referrer: Types.ObjectId;
let referee: Types.ObjectId;
let outsider: Types.ObjectId;

async function makeStudent(label: string, completed: boolean): Promise<Types.ObjectId> {
  const user = await User.create({
    name: `Ref ${label}`,
    email: `ref-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
    passwordHash: "x".repeat(60),
    role: "student",
    emailVerified: true,
  });

  await StudentProfile.create({
    userId: user._id,
    collegeId: new Types.ObjectId(),
    collegeName: "Test College",
    degree: "B.Tech",
    specialization: "CSE",
    graduationYear: 2028,
    studyStatus: "studying",
    profileCompleted: completed,
  });

  return user._id;
}

before(async () => {
  await connectDB();
  process.env.REFERRAL_REWARDS_ENABLED = "true";
  process.env.REFERRAL_REWARD_PAISE = "5000";
  process.env.REFERRAL_REFEREE_REWARD_PAISE = "2500";
  delete process.env.REFERRAL_MAX_REWARDED;

  referrer = await makeStudent("referrer", true);
  referee = await makeStudent("referee", true);
  outsider = await makeStudent("outsider", true);

  await Referral.createIndexes();
  await ReferralCode.createIndexes();
  await WalletTransaction.createIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Referral.deleteMany({});
  await Wallet.deleteMany({});
  await WalletTransaction.deleteMany({});
  await ReferralCode.updateMany({}, { $set: { signups: 0, rewarded: 0, earnedPaise: 0 } });
});

describe("codes", () => {
  it("issues one per student and keeps it", async () => {
    const first = await getOrCreateCode(String(referrer));
    const again = await getOrCreateCode(String(referrer));

    assert.equal(first, again);
    assert.ok(isWellFormedCode(first));
  });

  it("issues one code under concurrency, not five", async () => {
    const fresh = await makeStudent("concurrent", true);
    const codes = await Promise.all(
      Array.from({ length: 5 }, () => getOrCreateCode(String(fresh)))
    );

    assert.equal(new Set(codes).size, 1);
    assert.equal(await ReferralCode.countDocuments({ userId: fresh }), 1);
  });

  it("uses an alphabet with no ambiguous characters", async () => {
    // A code is dictated across a table. An O read as a zero is a referral that
    // does not happen.
    const code = await getOrCreateCode(String(referrer));
    for (const character of ["0", "O", "1", "I", "L"]) {
      assert.ok(!code.includes(character), `${character} should not appear`);
    }
  });

  it("resolves a code however it was typed back", async () => {
    const code = await getOrCreateCode(String(referrer));

    assert.equal(await ownerOfCode(code.toLowerCase()), String(referrer));
    assert.equal(await ownerOfCode(`  ${code}  `), String(referrer));
    assert.equal(
      await ownerOfCode(`${code.slice(0, 4)}-${code.slice(4)}`),
      String(referrer),
      "a hyphen inserted by the reader"
    );
  });

  it("does not resolve nonsense or a disabled code", async () => {
    assert.equal(await ownerOfCode("NOTACODE"), null);
    assert.equal(await ownerOfCode(""), null);

    const code = await getOrCreateCode(String(referrer));
    await ReferralCode.updateOne({ userId: referrer }, { $set: { disabled: true } });
    assert.equal(await ownerOfCode(code), null);

    await ReferralCode.updateOne({ userId: referrer }, { $set: { disabled: false } });
  });
});

describe("signing up with a code", () => {
  it("records the referral and pays nothing", async () => {
    const code = await getOrCreateCode(String(referrer));
    await recordSignup(String(referee), code);

    const row = await Referral.findOne({ refereeId: referee }).lean();
    assert.equal(row?.status, "pending");
    assert.equal(row?.referrerRewardPaise, 0);

    // Nothing has been earned yet — the account is free to create.
    assert.equal(await WalletTransaction.countDocuments({}), 0);
  });

  it("ignores a self-referral", async () => {
    const code = await getOrCreateCode(String(referrer));
    await recordSignup(String(referrer), code);

    assert.equal(await Referral.countDocuments({ refereeId: referrer }), 0);
  });

  it("ignores a code nobody owns, without throwing", async () => {
    // Called from the signup path: a bad code must never stop an account being
    // created.
    await recordSignup(String(referee), "ZZZZZZZZ");
    assert.equal(await Referral.countDocuments({ refereeId: referee }), 0);
  });

  /** One person is referred once, ever. */
  it("keeps the first attribution when two people claim the same signup", async () => {
    const first = await getOrCreateCode(String(referrer));
    const second = await getOrCreateCode(String(outsider));

    await recordSignup(String(referee), first);
    await recordSignup(String(referee), second);

    const rows = await Referral.find({ refereeId: referee }).lean();
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].referrerId), String(referrer));
  });
});

describe("qualifying", () => {
  async function pending() {
    const code = await getOrCreateCode(String(referrer));
    await recordSignup(String(referee), code);
  }

  it("pays both sides when the referee finishes", async () => {
    await pending();
    const result = await qualifyReferral(String(referee));

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.referrerRewardPaise, 5_000);
    assert.equal(result.ok && result.refereeRewardPaise, 2_500);

    const referrerWallet = await Wallet.findOne({ userId: referrer }).lean();
    const refereeWallet = await Wallet.findOne({ userId: referee }).lean();
    assert.equal(referrerWallet?.balancePaise, 5_000);
    assert.equal(refereeWallet?.balancePaise, 2_500);
  });

  it("files the payout as a referral, not an adjustment", async () => {
    // So the student's statement reads "Referral bonus" rather than something
    // that looks like an administrator moved their balance by hand.
    await pending();
    await qualifyReferral(String(referee));

    const row = await WalletTransaction.findOne({ userId: referrer }).lean();
    assert.equal(row?.type, "referral");
  });

  it("pays once, however many times it is called", async () => {
    // It runs on every profile save, so this is the normal case rather than an
    // edge one.
    await pending();
    await qualifyReferral(String(referee));
    await qualifyReferral(String(referee));
    await qualifyReferral(String(referee));

    const wallet = await Wallet.findOne({ userId: referrer }).lean();
    assert.equal(wallet?.balancePaise, 5_000);
    assert.equal(await WalletTransaction.countDocuments({ userId: referrer }), 1);
  });

  it("pays once under concurrency", async () => {
    await pending();
    const results = await Promise.all([
      qualifyReferral(String(referee)),
      qualifyReferral(String(referee)),
      qualifyReferral(String(referee)),
    ]);

    assert.equal(results.filter((result) => result.ok).length, 1);
    const wallet = await Wallet.findOne({ userId: referrer }).lean();
    assert.equal(wallet?.balancePaise, 5_000);
  });

  /**
   * The cheapest farm is one throwaway account issuing codes to twenty more.
   * Requiring the referrer to have done the same work doubles its cost.
   */
  it("refuses to pay a referrer who has not finished their own profile", async () => {
    const lazy = await makeStudent("lazy", false);
    const joiner = await makeStudent("joiner", true);

    const code = await getOrCreateCode(String(lazy));
    await recordSignup(String(joiner), code);

    const result = await qualifyReferral(String(joiner));
    assert.equal(!result.ok && result.reason, "referrer-ineligible");

    assert.equal(await Wallet.countDocuments({ userId: lazy }), 0);
    const row = await Referral.findOne({ refereeId: joiner }).lean();
    assert.equal(row?.status, "rejected");
  });

  it("refuses a self-referral row however it got there", async () => {
    /**
     * `recordSignup` already blocks this, so the row is written directly — the
     * guard exists for a row that arrived by some other path (a seed, an
     * import, a bug), which is the only way it can ever fire.
     *
     * Note what is *not* tested here: two accounts sharing an address.
     * `User.email` is unique, so that state cannot exist, which is why the
     * check compares ids rather than emails.
     */
    await Referral.create({
      referrerId: referrer,
      refereeId: referrer,
      code: await getOrCreateCode(String(referrer)),
      status: "pending",
    });

    const result = await qualifyReferral(String(referrer));
    assert.equal(!result.ok && result.reason, "self");

    assert.equal(await Wallet.countDocuments({ userId: referrer }), 0);
  });

  it("stops paying at the cap", async () => {
    process.env.REFERRAL_MAX_REWARDED = "2";

    for (let index = 0; index < 3; index += 1) {
      const joiner = await makeStudent(`capped-${index}`, true);
      const code = await getOrCreateCode(String(referrer));
      await recordSignup(String(joiner), code);
      await qualifyReferral(String(joiner));
    }

    assert.equal(await Referral.countDocuments({ referrerId: referrer, status: "rewarded" }), 2);
    assert.equal(await Referral.countDocuments({ referrerId: referrer, status: "rejected" }), 1);

    const wallet = await Wallet.findOne({ userId: referrer }).lean();
    assert.equal(wallet?.balancePaise, 10_000, "two rewards, not three");

    delete process.env.REFERRAL_MAX_REWARDED;
  });

  it("records nothing to pay when rewards are switched off", async () => {
    process.env.REFERRAL_REWARDS_ENABLED = "false";

    await pending();
    const result = await qualifyReferral(String(referee));

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.paid, false);
    // The referral still counts — only the money is off.
    const row = await Referral.findOne({ refereeId: referee }).lean();
    assert.equal(row?.status, "rewarded");
    assert.equal(await WalletTransaction.countDocuments({}), 0);

    process.env.REFERRAL_REWARDS_ENABLED = "true";
  });

  it("does nothing for somebody nobody referred", async () => {
    const result = await qualifyReferral(String(outsider));
    assert.equal(!result.ok && result.reason, "none");
  });

  it("remembers what was paid, not what the rate is now", async () => {
    // An operator who raises the bonus next term must not appear to have
    // retroactively paid everyone more.
    await pending();
    await qualifyReferral(String(referee));

    process.env.REFERRAL_REWARD_PAISE = "50000";
    const row = await Referral.findOne({ refereeId: referee }).lean();
    assert.equal(row?.referrerRewardPaise, 5_000);

    process.env.REFERRAL_REWARD_PAISE = "5000";
  });
});

describe("the share screen", () => {
  it("counts signups, rewards and earnings", async () => {
    const code = await getOrCreateCode(String(referrer));
    const joiner = await makeStudent("summary", true);

    await recordSignup(String(joiner), code);
    await qualifyReferral(String(joiner));
    await recordSignup(String(referee), code);

    const summary = await getSummary(String(referrer));
    assert.equal(summary.signups, 2);
    assert.equal(summary.rewarded, 1);
    assert.equal(summary.pending, 1);
    assert.equal(summary.earnedPaise, 5_000);
    assert.equal(summary.eligible, true);
  });

  it("shows a first name only, never an address", async () => {
    // The referrer should see that their friend arrived. The invite list is not
    // a directory.
    const code = await getOrCreateCode(String(referrer));
    await recordSignup(String(referee), code);

    const summary = await getSummary(String(referrer));
    const serialised = JSON.stringify(summary);

    assert.equal(summary.invites[0].name, "Ref");
    assert.ok(!serialised.includes("@test.local"), "no email anywhere in the payload");
  });

  it("says when the referrer is not yet eligible", async () => {
    const lazy = await makeStudent("ineligible", false);
    const summary = await getSummary(String(lazy));
    assert.equal(summary.eligible, false);
  });
});

describe("code normalisation", () => {
  it("accepts what a reader would plausibly type", () => {
    assert.equal(normaliseCode("  abcd-2345 "), "ABCD2345");
    assert.equal(isWellFormedCode("abcd2345"), true);
  });

  it("rejects the wrong length or a banned character", () => {
    assert.equal(isWellFormedCode("ABCD234"), false);
    assert.equal(isWellFormedCode("ABCD23450"), false);
    assert.equal(isWellFormedCode("ABCD234O"), false, "O is not in the alphabet");
  });
});
