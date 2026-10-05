/**
 * The payments vocabulary (money, states, limits).
 *
 * One file, read by the models, the Razorpay client, the ledger service, the
 * API routes, the wallet screen and the admin table — so a value changed here
 * cannot be changed in only five of the six places that care.
 *
 * ## Money is integer paise, everywhere
 *
 * Not rupees, and never a float. `0.1 + 0.2 !== 0.3` in IEEE 754, and a wallet
 * that accumulates a thousandth of a rupee per top-up is a wallet that has to be
 * reconciled by hand. Razorpay's API is also denominated in paise, so storing
 * anything else would mean converting on every call in both directions, which is
 * exactly where the rounding error would live.
 *
 * The rule: **paise at rest and on the wire, rupees only when rendering.** Every
 * field that holds money is named `...Paise` so a bare `amount` is visibly wrong
 * at the call site.
 */

export const CURRENCY = "INR" as const;

// ── Money ─────────────────────────────────────────────────────────────────

/** Rupees to paise. Rejects anything that is not a clean amount. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new RangeError("Amount is not a number");
  const paise = Math.round(rupees * 100);
  // Guard the rounding rather than trusting it: `Math.round` would happily turn
  // 10.005 into 1001 paise and lose the half-paise silently.
  if (Math.abs(paise / 100 - rupees) > 1e-9) {
    throw new RangeError("Amount has more precision than paise");
  }
  return paise;
}

/**
 * Paise to a rupee string, for display only.
 *
 * Never fed back into arithmetic — the return type is a string on purpose, so
 * it cannot be added to anything.
 */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;

  return `${sign}₹${rupees.toLocaleString("en-IN")}${remainder ? `.${String(remainder).padStart(2, "0")}` : ""}`;
}

/** Whether a value is a usable paise amount: a positive whole number. */
export function isValidPaise(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// ── Limits (§ deliberately conservative) ──────────────────────────────────

/**
 * Bounds on what a student may add, and hold.
 *
 * The minimum exists because a ₹1 top-up costs more in payment-gateway fees
 * than it adds. The maximum is not a technical limit but a blast radius: a
 * campus wallet has no reason to hold a lakh, and a cap is what turns a
 * compromised account into a bounded loss. The daily cap is the same argument
 * applied to a stolen card.
 *
 * All of these are **server-side**. The screen renders them so a student is not
 * surprised, but the screen is not what enforces them.
 */
export const WALLET_LIMITS = {
  minTopUpPaise: 1_000, // ₹10
  maxTopUpPaise: 5_000_000, // ₹50,000 in one go
  maxBalancePaise: 10_000_000, // ₹1,00,000 held
  maxDailyTopUpPaise: 5_000_000, // ₹50,000 a day
  /** Orders a student may open per hour, whether or not they pay. */
  ordersPerHour: 10,
} as const;

/** The quick-pick buttons on the wallet screen, in paise. */
export const TOP_UP_PRESETS_PAISE = [10_000, 25_000, 50_000, 100_000, 200_000] as const;

// ── Transactions ──────────────────────────────────────────────────────────

/**
 * Every reason money moves.
 *
 * A closed set because the ledger is the record of what happened, and "some
 * other kind of movement" is not something a statement can render or an auditor
 * can reconcile. Adding a reason is a deliberate change here, not a free-text
 * string a caller invents.
 */
export const TRANSACTION_TYPES = [
  /** Money in, from a payment gateway. */
  "topup",
  /** Money out, spent on a campus service. */
  "spend",
  /** Money back to the card it came from, reversing a top-up. */
  "refund",
  /** Money back to the wallet, reversing a spend. */
  "reversal",
  /** An administrator correcting the balance, always with a reason. */
  "adjustment",
  /** Money in, for inviting somebody who then actually joined. */
  "referral",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  topup: "Money added",
  spend: "Payment",
  refund: "Refunded",
  reversal: "Reversed",
  adjustment: "Adjustment",
  referral: "Referral bonus",
};

/**
 * Which way each type moves the balance.
 *
 * Derived from the type rather than stored beside it, so a row can never claim
 * to be a `topup` that debits. The one thing a ledger must never get wrong.
 */
export const TRANSACTION_DIRECTION: Record<TransactionType, "credit" | "debit"> = {
  topup: "credit",
  spend: "debit",
  refund: "debit",
  reversal: "credit",
  adjustment: "credit", // sign carried by the amount; see `adjustWallet`
  referral: "credit",
};

export const TRANSACTION_STATUSES = ["pending", "success", "failed"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// ── Payment orders ────────────────────────────────────────────────────────

/**
 * The states a Razorpay order passes through, as **we** see them.
 *
 * Not a mirror of Razorpay's own enum. Theirs describes the order; this
 * describes what we have done about it, which is the thing that decides whether
 * a wallet has been credited. `paid` here means "credited to the wallet", and
 * that is why it cannot simply be copied from a webhook payload.
 */
export const ORDER_STATUSES = [
  /** Created with Razorpay; the student has not paid yet. */
  "created",
  /** The student opened checkout. Nothing is owed on this state. */
  "attempted",
  /** Captured *and* credited to the wallet. Terminal. */
  "paid",
  /** Razorpay told us the payment failed. Terminal. */
  "failed",
  /** The student walked away and the order aged out. Terminal. */
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * An order that has reached one of these will never move again.
 *
 * Checked before every state change, because webhooks arrive out of order:
 * `payment.failed` for a first attempt can land *after* `payment.captured` for
 * the retry, and applying it would mark a paid order failed.
 */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ["paid", "failed", "expired"];

export function isTerminalOrder(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/**
 * How long an unpaid order stays open.
 *
 * Razorpay keeps orders indefinitely; we do not, because an order is a promise
 * to accept a specific amount and one left open for a month is a promise nobody
 * remembers making.
 */
export const ORDER_TTL_MINUTES = 30;

// ── Webhooks ──────────────────────────────────────────────────────────────

/**
 * The events acted on.
 *
 * Razorpay sends many more. Everything not listed is acknowledged with a 200 and
 * ignored — returning an error for an event we simply do not handle would make
 * Razorpay retry it forever and eventually disable the endpoint.
 */
export const HANDLED_WEBHOOK_EVENTS = [
  "payment.captured",
  "payment.failed",
  "order.paid",
  "refund.processed",
  "refund.failed",
] as const;
export type HandledWebhookEvent = (typeof HANDLED_WEBHOOK_EVENTS)[number];

export function isHandledEvent(event: string): event is HandledWebhookEvent {
  return (HANDLED_WEBHOOK_EVENTS as readonly string[]).includes(event);
}

/**
 * The idempotency key for a credit.
 *
 * One payment credits one wallet once, however many times we are told about it.
 * A unique index on this string is what enforces that — not a check-then-write,
 * which two concurrent webhook deliveries would both pass.
 */
export function creditKeyFor(paymentId: string): string {
  return `razorpay:payment:${paymentId}`;
}

export function refundKeyFor(refundId: string): string {
  return `razorpay:refund:${refundId}`;
}

/**
 * The idempotency key for a referral payout.
 *
 * Keyed on the **referral**, not on either person, so the two sides of one
 * referral get distinct keys and neither can be paid twice however many times
 * qualification is attempted.
 */
export function referralKeyFor(referralId: string, side: "referrer" | "referee"): string {
  return `referral:${referralId}:${side}`;
}
