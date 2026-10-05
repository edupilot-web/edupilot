import { randomInt } from "node:crypto";

/**
 * The referral vocabulary.
 *
 * A referral programme is the most reliably abused feature in any product, so
 * most of this file is about what does **not** earn a reward. The shape of the
 * defence, in order of how much work it does:
 *
 * 1. **Reward on qualification, not signup.** An account is free to create; a
 *    completed academic profile at a real college with a confirmed address is
 *    not. Paying on signup means paying for disposable mailboxes.
 * 2. **One referral per referee, ever.** A unique index, so it is a database
 *    guarantee rather than a check somebody has to remember.
 * 3. **A cap per referrer.** Bounds the loss when the first two are beaten by
 *    somebody patient.
 *
 * None of these is clever. They do not need to be: the aim is to make farming
 * cost more than the reward is worth, not to make it impossible.
 */

// ── Status ────────────────────────────────────────────────────────────────

export const REFERRAL_STATUSES = [
  /** They signed up with the code and have not finished onboarding. */
  "pending",
  /** They finished. Both sides have been paid. */
  "rewarded",
  /** Rejected for a stated reason — self-referral, cap reached. */
  "rejected",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: "Signed up",
  rewarded: "Reward paid",
  rejected: "Not eligible",
};

/**
 * Why a referral was turned down.
 *
 * A closed set, and shown to the referrer. "Not eligible" with no reason is how
 * a referral programme generates support tickets.
 */
export const REJECTION_REASONS = {
  self: "You cannot refer yourself.",
  cap: "You have reached the maximum number of rewarded referrals.",
  duplicate: "That person was already referred by someone else.",
  "referrer-ineligible": "Finish your own profile before you can earn referral rewards.",
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;

// ── Rewards ───────────────────────────────────────────────────────────────

/**
 * What each side gets, in paise, and how many times.
 *
 * Both sides are paid because a one-sided programme asks a student to spend
 * social capital for nothing — the person being invited has no reason to
 * finish, which is the step that actually matters.
 *
 * The referrer's share is larger: they did the work of persuading somebody.
 *
 * Read from the environment so the numbers are an operator's decision rather
 * than a deploy, and clamped so a typo cannot turn a ₹50 bonus into ₹50,000.
 */
const MAX_REWARD_PAISE = 100_000; // ₹1,000 — a ceiling on the typo, not a target

export function referrerRewardPaise(): number {
  return clampReward(readEnvPaise("REFERRAL_REWARD_PAISE", 5_000));
}

export function refereeRewardPaise(): number {
  return clampReward(readEnvPaise("REFERRAL_REFEREE_REWARD_PAISE", 2_500));
}

/**
 * Rewarded referrals one student may earn, ever.
 *
 * Not a rate limit. A cap bounds the total loss if somebody finds a way through
 * everything above, and a genuine student who has brought twenty friends to the
 * platform has already done the thing the programme exists to encourage.
 */
export function referralCap(): number {
  const raw = Number(process.env.REFERRAL_MAX_REWARDED?.trim());
  if (!Number.isSafeInteger(raw) || raw < 0) return 20;
  return Math.min(raw, 500);
}

/** Whether rewards are paid at all. Sharing still works when they are not. */
export function rewardsEnabled(): boolean {
  return process.env.REFERRAL_REWARDS_ENABLED?.trim().toLowerCase() !== "false";
}

function readEnvPaise(name: string, fallback: number): number {
  const raw = Number(process.env[name]?.trim());
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : fallback;
}

function clampReward(value: number): number {
  return Math.max(0, Math.min(value, MAX_REWARD_PAISE));
}

// ── Codes ─────────────────────────────────────────────────────────────────

/**
 * The alphabet, minus everything that is ambiguous when read aloud or retyped.
 *
 * No `0`/`O`, no `1`/`I`/`L`. A referral code is dictated across a table in a
 * canteen, and a code that produces a "no such code" error because somebody
 * heard an O for a zero is a referral that does not happen.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

/**
 * A random code.
 *
 * Random rather than derived from the name or the user id. A derived code leaks
 * whose it is, and a sequential one can be enumerated — which matters less than
 * it sounds (knowing a code lets you credit its owner, not steal from them) but
 * costs nothing to avoid.
 *
 * `randomInt` is rejection-sampled by Node, so there is none of the modulo bias
 * `randomBytes(1) % 31` would introduce.
 */
export function generateCode(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

/**
 * Normalise what somebody typed or pasted.
 *
 * Upper-cased and stripped of spaces and hyphens, because a code shown as
 * `ABCD-2345` will be typed back with the hyphen, and one copied from a chat
 * app arrives with a trailing space.
 */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isWellFormedCode(input: string): boolean {
  const code = normaliseCode(input);
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((character) => ALPHABET.includes(character));
}

// ── Sharing ───────────────────────────────────────────────────────────────

/** The query parameter a shared link carries. */
export const REFERRAL_PARAM = "ref";

/**
 * What a student sends their friend.
 *
 * The invite lands on **sign-up** rather than the home page: a referral link
 * that needs the recipient to find the sign-up button is a referral link that
 * loses people at the first step.
 */
export function shareUrlFor(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/$/, "")}/signup?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}

export function shareMessageFor(url: string, refereeRewardPaise: number): string {
  const rupees = Math.round(refereeRewardPaise / 100);

  return rupees > 0
    ? `Join me on EduPilot — your syllabus, assignments and an AI tutor in one place. Sign up with my link and we both get ₹${rupees} in our campus wallet: ${url}`
    : `Join me on EduPilot — your syllabus, assignments and an AI tutor in one place: ${url}`;
}
