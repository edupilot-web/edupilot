import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { StudentProfile } from "@/models/StudentProfile";
import { Referral, ReferralCode } from "@/models/Referral";
import { postTransaction } from "@/lib/payments/wallet";
import { referralKeyFor } from "@/lib/payments/fields";
import {
  generateCode,
  isWellFormedCode,
  normaliseCode,
  refereeRewardPaise,
  referralCap,
  referrerRewardPaise,
  rewardsEnabled,
  type RejectionReason,
} from "@/lib/referrals/fields";

/**
 * Referrals.
 *
 * Three moments: a student gets a code, somebody signs up with it, and that
 * somebody finishes onboarding. Only the third pays.
 *
 * The gap between the second and the third is the whole design. An account is
 * free to create, so paying on signup is paying for disposable mailboxes. A
 * completed academic profile at a real college, with a confirmed address, costs
 * enough effort that farming it is not worth ₹50 — and it is also the thing the
 * platform actually wants, which makes the incentive point the right way.
 */

// ── Codes ─────────────────────────────────────────────────────────────────

/**
 * This student's code, creating one on first use.
 *
 * Retries on a collision. Eight characters from a 31-letter alphabet makes one
 * vanishingly unlikely, but "vanishingly unlikely" is not "impossible", and the
 * unique index turns the difference into a retry rather than two students
 * sharing a code and one of them never being paid.
 */
export async function getOrCreateCode(userId: string): Promise<string> {
  await connectDB();

  const existing = await ReferralCode.findOne({ userId }).select("code").lean();
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      await ReferralCode.create({ userId: new Types.ObjectId(userId), code });
      return code;
    } catch (err) {
      if (!isDuplicate(err)) throw err;

      // Either the code collided, or this user got one from a concurrent
      // request. The second is the likelier of the two.
      const raced = await ReferralCode.findOne({ userId }).select("code").lean();
      if (raced) return raced.code;
    }
  }

  throw new Error("Could not issue a referral code after five attempts");
}

function isDuplicate(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/** Who owns a code, if anyone. Null for unknown, malformed or disabled codes. */
export async function ownerOfCode(input: string): Promise<string | null> {
  if (!isWellFormedCode(input)) return null;

  await connectDB();
  const row = await ReferralCode.findOne({ code: normaliseCode(input), disabled: { $ne: true } })
    .select("userId")
    .lean();

  return row ? String(row.userId) : null;
}

// ── Signup ────────────────────────────────────────────────────────────────

/**
 * Record that somebody signed up with a code. Pays nothing.
 *
 * Deliberately **never throws and never blocks**. It is called from the signup
 * path, and a referral that cannot be recorded must not stop an account being
 * created — a student who cannot register because a referral code was malformed
 * is a far worse outcome than a referral that goes unattributed.
 */
export async function recordSignup(refereeId: string, rawCode: string): Promise<void> {
  try {
    const referrerId = await ownerOfCode(rawCode);
    if (!referrerId) return;

    /**
     * Self-referral, caught on the id.
     *
     * The email check is not enough on its own — somebody can hold two
     * addresses — but this catches the case that actually happens, which is a
     * student pasting their own link to see what it does.
     */
    if (referrerId === refereeId) return;

    await Referral.create({
      referrerId: new Types.ObjectId(referrerId),
      refereeId: new Types.ObjectId(refereeId),
      code: normaliseCode(rawCode),
      status: "pending",
    });

    await ReferralCode.updateOne({ userId: referrerId }, { $inc: { signups: 1 } });
  } catch (err) {
    // A duplicate means this person was already referred by somebody else. The
    // first attribution stands; there is nothing to do and nothing wrong.
    if (isDuplicate(err)) return;
    console.error("[referrals] could not record a signup:", err);
  }
}

// ── Qualification ─────────────────────────────────────────────────────────

export type QualifyResult =
  | { ok: true; paid: boolean; referrerRewardPaise: number; refereeRewardPaise: number }
  | { ok: false; reason: "none" | RejectionReason };

/**
 * The referee finished onboarding. Pay both sides.
 *
 * Called from `saveAcademicSelection` when a profile first becomes complete,
 * and safe to call on every save after that — a referral already `rewarded`
 * short-circuits, and the wallet keys would refuse a second credit even if it
 * did not.
 *
 * Like `recordSignup`, this never throws into its caller: a payout that fails
 * must not prevent a student's profile being saved.
 */
export async function qualifyReferral(refereeId: string): Promise<QualifyResult> {
  await connectDB();

  const referral = await Referral.findOne({ refereeId, status: "pending" });
  if (!referral) return { ok: false, reason: "none" };

  const referrerId = String(referral.referrerId);

  /**
   * The referrer has to be a finished student themselves.
   *
   * Otherwise the cheapest farm is one throwaway account issuing codes to
   * twenty more — the referrer never has to do anything at all. Requiring them
   * to have completed the same work doubles the cost of every fake chain.
   */
  const referrer = await StudentProfile.findOne({ userId: referrerId })
    .select("profileCompleted")
    .lean();

  if (!referrer?.profileCompleted) {
    return reject(referral, "referrer-ineligible");
  }

  /**
   * Self-referral, re-checked on the **stored row**.
   *
   * `recordSignup` already refuses one, so this only fires for a row written by
   * some other path — a seed script, a future import, a bug. Worth keeping for
   * that reason and not for the obvious one.
   *
   * It deliberately compares ids rather than addresses: `User.email` carries a
   * unique index, so two accounts cannot share an address and an email
   * comparison here could never be true. A guard that cannot fire is worse than
   * no guard, because it reads like protection.
   */
  if (referrerId === String(referral.refereeId)) {
    return reject(referral, "self");
  }

  const [referrerUser, refereeUser] = await Promise.all([
    User.findById(referrerId).select("name").lean(),
    User.findById(refereeId).select("name").lean(),
  ]);

  if (!referrerUser || !refereeUser) return reject(referral, "self");

  const rewarded = await Referral.countDocuments({ referrerId, status: "rewarded" });
  if (rewarded >= referralCap()) {
    return reject(referral, "cap");
  }

  const referrerPaise = rewardsEnabled() ? referrerRewardPaise() : 0;
  const refereePaise = rewardsEnabled() ? refereeRewardPaise() : 0;

  /**
   * The referral is marked **before** the money moves, conditionally on it
   * still being pending.
   *
   * That makes "is it unpaid" and "claim it" one atomic operation, so two
   * concurrent qualifications cannot both proceed to pay. The wallet's own
   * idempotency key is the second line of defence; this is the first, and it is
   * the one that keeps the counters honest.
   */
  const claimed = await Referral.findOneAndUpdate(
    { _id: referral._id, status: "pending" },
    {
      $set: {
        status: "rewarded",
        qualifiedAt: new Date(),
        referrerRewardPaise: referrerPaise,
        refereeRewardPaise: refereePaise,
      },
    },
    { returnDocument: "after" }
  );

  if (!claimed) return { ok: false, reason: "none" };

  if (referrerPaise > 0) {
    await credit(referrerId, referrerPaise, referral._id, "referrer", refereeUser.name);
  }
  if (refereePaise > 0) {
    await credit(refereeId, refereePaise, referral._id, "referee", referrerUser.name);
  }

  await ReferralCode.updateOne(
    { userId: referrerId },
    { $inc: { rewarded: 1, earnedPaise: referrerPaise } }
  );

  return {
    ok: true,
    paid: referrerPaise > 0 || refereePaise > 0,
    referrerRewardPaise: referrerPaise,
    refereeRewardPaise: refereePaise,
  };
}

async function credit(
  userId: string,
  amountPaise: number,
  referralId: Types.ObjectId,
  side: "referrer" | "referee",
  otherName: string | undefined
): Promise<void> {
  const result = await postTransaction({
    userId,
    type: "referral",
    amountPaise,
    idempotencyKey: referralKeyFor(String(referralId), side),
    description:
      side === "referrer"
        ? `Referral bonus${otherName ? ` — ${otherName.split(/\s+/)[0]} joined` : ""}`
        : "Welcome bonus",
    reference: { kind: "internal" },
  });

  if (!result.ok) {
    /**
     * Logged, not thrown.
     *
     * The commonest cause is the wallet's holding cap, which is a real refusal
     * and not an error — and either way this runs inside a profile save that
     * must not fail because a bonus could not land.
     */
    console.error(`[referrals] could not credit the ${side} of ${referralId}: ${result.code}`);
  }
}

async function reject(
  referral: { _id: Types.ObjectId },
  reason: RejectionReason
): Promise<QualifyResult> {
  await Referral.updateOne(
    { _id: referral._id, status: "pending" },
    { $set: { status: "rejected", rejectionReason: reason } }
  );
  return { ok: false, reason };
}

// ── The share screen ──────────────────────────────────────────────────────

export type ReferralSummary = {
  code: string;
  signups: number;
  rewarded: number;
  pending: number;
  earnedPaise: number;
  /** Rewarded referrals still available under the cap. */
  remaining: number;
  cap: number;
  rewardsEnabled: boolean;
  referrerRewardPaise: number;
  refereeRewardPaise: number;
  /** False until this student finishes their own profile. */
  eligible: boolean;
  invites: {
    id: string;
    name: string | null;
    status: string;
    rewardPaise: number;
    rejectionReason: string | null;
    joinedAt: string;
  }[];
};

export async function getSummary(userId: string): Promise<ReferralSummary> {
  await connectDB();

  const [code, profile, referrals] = await Promise.all([
    getOrCreateCode(userId),
    StudentProfile.findOne({ userId }).select("profileCompleted").lean(),
    Referral.find({ referrerId: userId }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  const names = await User.find({ _id: { $in: referrals.map((row) => row.refereeId) } })
    .select("name")
    .lean();
  const byId = new Map(names.map((user) => [String(user._id), user.name]));

  const rewarded = referrals.filter((row) => row.status === "rewarded").length;
  const cap = referralCap();

  return {
    code,
    signups: referrals.length,
    rewarded,
    pending: referrals.filter((row) => row.status === "pending").length,
    earnedPaise: referrals.reduce((sum, row) => sum + (row.referrerRewardPaise ?? 0), 0),
    remaining: Math.max(0, cap - rewarded),
    cap,
    rewardsEnabled: rewardsEnabled(),
    referrerRewardPaise: referrerRewardPaise(),
    refereeRewardPaise: refereeRewardPaise(),
    eligible: profile?.profileCompleted === true,
    invites: referrals.map((row) => ({
      id: String(row._id),
      /**
       * A first name only.
       *
       * The referrer invited them and should see that they arrived, but a full
       * name and an email address is more than "did my friend join" needs, and
       * the invite list is not a directory.
       */
      name: byId.get(String(row.refereeId))?.split(/\s+/)[0] ?? null,
      status: row.status,
      rewardPaise: row.referrerRewardPaise ?? 0,
      rejectionReason: row.rejectionReason ?? null,
      joinedAt: (row.createdAt as Date).toISOString(),
    })),
  };
}
