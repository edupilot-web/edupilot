import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { CURRENCY } from "@/lib/payments/fields";

/**
 * Razorpay, through the official SDK.
 *
 * The SDK owns the transport, the endpoint paths and the response shapes. This
 * file owns three things it does not give us, and each is here for a reason:
 *
 * 1. **A timeout.** `IRazorpayConfig` is `{ key_id, key_secret, headers,
 *    oauthToken }` — there is no timeout option and no axios passthrough. A hung
 *    order-create with no deadline is a student watching a spinner with no way
 *    to know whether they have been charged.
 * 2. **Error mapping onto a closed set.** The SDK throws a plain
 *    `{ statusCode, error }` object — not an `Error` — and `orders.ts` branches
 *    on `retryable` to decide whether a webhook should return non-2xx and be
 *    redelivered. That decision has to survive whatever the vendor throws.
 * 3. **Constant-time signature checks.** See `verifyWebhookSignature`.
 *
 * ## Credentials
 *
 * Read from `process.env` at call time, never cached in a module variable and
 * never stored in the database. Three, and they are **not** interchangeable:
 *
 * | Variable | Secret? | Used for |
 * | --- | --- | --- |
 * | `RAZORPAY_KEY_ID` | no — it reaches the browser | naming the account at checkout |
 * | `RAZORPAY_KEY_SECRET` | yes | API auth, and the checkout callback signature |
 * | `RAZORPAY_WEBHOOK_SECRET` | yes | the webhook signature, and *only* that |
 *
 * The webhook secret is separate in Razorpay's own design, and conflating them
 * is a common mistake: verification then fails for every webhook, which looks
 * like Razorpay being broken rather than like a configuration error.
 */

/** How long any single Razorpay call may take before we stop waiting. */
const TIMEOUT_MS = 20_000;

export type RazorpayMode = "test" | "live";

export class PaymentError extends Error {
  readonly code:
    | "not-configured"
    | "unauthorized"
    | "rejected"
    | "rate-limited"
    | "unavailable"
    | "timeout"
    | "unknown";
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: PaymentError["code"],
    message: string,
    options?: { retryable?: boolean; status?: number }
  ) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE.has(code);
    this.status = options?.status;
  }
}

const RETRYABLE = new Set(["rate-limited", "unavailable", "timeout"]);

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function keyId(): string | null {
  return env("RAZORPAY_KEY_ID");
}

function keySecret(): string | null {
  return env("RAZORPAY_KEY_SECRET");
}

function webhookSecret(): string | null {
  return env("RAZORPAY_WEBHOOK_SECRET");
}

/**
 * Test or live, read from the key itself rather than from a separate flag.
 *
 * A `RAZORPAY_MODE` variable beside the keys is one that can disagree with them,
 * and the direction it disagrees in — a live key with the mode left on "test" —
 * takes real money while every screen says sandbox. The prefix cannot be wrong,
 * because it *is* the key.
 */
export function mode(): RazorpayMode {
  return keyId()?.startsWith("rzp_live") ? "live" : "test";
}

/** Whether payments can run at all on this deployment. */
export function isPaymentsConfigured(): boolean {
  return Boolean(keyId() && keySecret());
}

/** Whether webhooks can be verified. Separate: one can be set without the other. */
export function isWebhookConfigured(): boolean {
  return Boolean(webhookSecret());
}

/**
 * A client per call, not a module-level singleton.
 *
 * The SDK takes its credentials in the constructor, so a cached instance would
 * hold whatever the key was at boot — and a long-lived server would keep serving
 * a rotated-out key. Constructing one assembles an axios instance; it costs
 * nothing next to the HTTP call that follows.
 *
 * Called **outside** `call()` by every caller, so a missing key throws
 * `not-configured` rather than being caught by the transport handler and
 * relabelled `unavailable`. A missing credential is not transient and must not
 * be reported as if it were.
 */
function client(): Razorpay {
  const id = keyId();
  const secret = keySecret();

  if (!id || !secret) {
    throw new PaymentError("not-configured", "Payments are not configured on this server.", {
      retryable: false,
    });
  }

  return new Razorpay({ key_id: id, key_secret: secret });
}

// ── Transport ─────────────────────────────────────────────────────────────

type SdkError = { statusCode?: number; error?: { code?: string; description?: string } };

/**
 * Run an SDK call under a deadline, and normalise whatever it throws.
 *
 * `Promise.race` rather than an abort signal, because the SDK exposes no way to
 * pass one. The honest difference: this stops us **waiting**, it does not cancel
 * the request — the socket stays open until axios finishes with it.
 *
 * Acceptable here because a late response cannot do harm: the `await` has
 * already rejected and the caller has moved on, so there is nothing left for it
 * to mutate. An order created after we gave up is an orphan either way, which is
 * equally true of a real abort — cancelling client-side never un-does a
 * server-side write.
 */
async function call<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new PaymentError("timeout", "Razorpay did not respond in time.")),
      TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([operation(), deadline]);
  } catch (err) {
    throw normalise(err);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map whatever the SDK threw onto the closed set.
 *
 * Three shapes arrive here:
 *
 * - our own `PaymentError`, from the timeout — passed through;
 * - the SDK's `{ statusCode, error }`, which is a **plain object**, not an
 *   `Error`, so `instanceof` is no help and the shape has to be sniffed;
 * - a `TypeError`, when the request never reached Razorpay at all. Their
 *   `normalizeError` reads `err.response.status` unguarded, so a DNS failure or
 *   a dropped connection throws from inside the SDK rather than producing an
 *   error object. It surfaces here as `unavailable`, which is what it is.
 */
function normalise(err: unknown): PaymentError {
  if (err instanceof PaymentError) return err;

  const sdk = err as SdkError;
  if (typeof sdk?.statusCode === "number") {
    return errorFor(sdk.statusCode, sdk.error?.description);
  }

  return new PaymentError("unavailable", "Razorpay could not be reached.");
}

/**
 * `description` is passed through for 400: it names the field that was wrong and
 * is the whole diagnosis. It is **not** passed through for 401 — that response
 * can echo the key id, and a credential has no business in a log line or an
 * error surfaced to a caller.
 */
function errorFor(status: number, detail?: string): PaymentError {
  if (status === 400) {
    return new PaymentError(
      "rejected",
      `Razorpay rejected the request${detail ? `: ${detail}` : "."}`,
      { retryable: false, status }
    );
  }
  if (status === 401 || status === 403) {
    return new PaymentError(
      "unauthorized",
      "Razorpay rejected the API credentials. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      { retryable: false, status }
    );
  }
  if (status === 429) {
    return new PaymentError("rate-limited", "Razorpay rate limit reached.", { status });
  }
  if (status >= 500) {
    return new PaymentError("unavailable", "Razorpay is temporarily unavailable.", { status });
  }
  return new PaymentError("unknown", `Razorpay returned an unexpected status ${status}.`, {
    status,
  });
}

// ── Orders ────────────────────────────────────────────────────────────────

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
};

export async function createOrder(input: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const rzp = client();

  const order = await call(() =>
    rzp.orders.create({
      amount: input.amountPaise,
      currency: CURRENCY,
      receipt: input.receipt,
      /**
       * Auto-capture.
       *
       * Without it a payment lands `authorized` and needs a second call to
       * capture, and an authorisation that is never captured is money held on a
       * student's card that silently expires. There is nothing to review between
       * the two steps for a wallet top-up — the goods are a number going up — so
       * the two-step flow adds a failure mode and buys nothing.
       */
      payment_capture: true,
      notes: input.notes ?? {},
    })
  );

  return {
    id: order.id,
    // The SDK types `amount` as `string | number`; ours is always paise.
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt ?? input.receipt,
    status: order.status,
  };
}

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  error_description?: string | null;
  error_reason?: string | null;
};

/**
 * Read a payment back from Razorpay.
 *
 * Used to **re-check** what a browser or a webhook told us. A signature proves a
 * message came from Razorpay; it does not prove the payment is still captured,
 * and a payment can be refunded between a webhook being queued and it arriving.
 */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const rzp = client();
  const payment = await call(() => rzp.payments.fetch(paymentId));

  return {
    id: payment.id,
    order_id: payment.order_id ?? null,
    amount: Number(payment.amount),
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    error_description: payment.error_description ?? null,
    error_reason: payment.error_reason ?? null,
  };
}

export type RazorpayRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
};

export async function createRefund(input: {
  paymentId: string;
  amountPaise: number;
  notes?: Record<string, string>;
}): Promise<RazorpayRefund> {
  const rzp = client();

  const refund = await call(() =>
    rzp.payments.refund(input.paymentId, {
      amount: input.amountPaise,
      /**
       * `normal`, not `optimum`. Instant refunds cost extra and land on the same
       * card either way; a campus wallet has no reason to pay for speed.
       */
      speed: "normal",
      notes: input.notes ?? {},
    })
  );

  return {
    id: refund.id,
    payment_id: refund.payment_id,
    amount: Number(refund.amount),
    status: refund.status as RazorpayRefund["status"],
  };
}

// ── Signatures ────────────────────────────────────────────────────────────

/**
 * Compare two digests without leaking how far they matched.
 *
 * `===` returns as soon as two characters differ, and that timing is measurable
 * across enough requests — which is a way to derive a valid signature one
 * character at a time. `timingSafeEqual` compares every byte regardless.
 *
 * It throws on a length mismatch, so lengths are checked first; that leaks only
 * the *length* of the supplied value, which the caller chose.
 */
function safeEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify the signature Razorpay Checkout hands the browser.
 *
 * HMAC-SHA256 of `order_id|payment_id` keyed with the **key secret**. This is
 * what makes the browser callback trustworthy at all: the browser cannot forge
 * it without the secret, which never leaves the server.
 *
 * It proves the payment happened. It does not prove the amount — that comes from
 * our own order row — and it does not prove the payment is still captured.
 */
export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = keySecret();
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  return safeEqual(expected, input.signature);
}

/**
 * Verify a webhook, against the **raw request body**.
 *
 * Deliberately *not* `Razorpay.validateWebhookSignature`, and the reason is
 * worth stating because reaching for the vendor helper is the obvious move:
 *
 * - it compares with `expectedSignature === signature`, which is not
 *   constant-time;
 * - it **throws** when the signature header is missing, so a malformed request
 *   would become a 500 where it should be a 400.
 *
 * The maths is four lines and identical; only the comparison and the failure
 * mode differ, and both differences favour this version.
 *
 * The raw bytes matter: `JSON.parse` then `JSON.stringify` reorders keys and
 * drops insignificant whitespace, and the digest of the round-tripped string
 * does not match the digest of what was sent. Every caller must read
 * `await req.text()` and hash *that*, before parsing.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = webhookSecret();
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
