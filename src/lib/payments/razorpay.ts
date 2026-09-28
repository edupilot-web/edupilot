import { createHmac, timingSafeEqual } from "node:crypto";
import { CURRENCY } from "@/lib/payments/fields";

/**
 * Razorpay, over `fetch`.
 *
 * No SDK, for the same reason `gemini.ts` has none: the surface used here is
 * four endpoints and an HMAC, and a dependency that ships its own transport and
 * retry policy would have to be reconciled with this app's rather than reused.
 * It also keeps the credential handling visible — the one thing worth being able
 * to read in full on a payments integration.
 *
 * ## Credentials
 *
 * Read from `process.env` at call time, never cached in a module variable and
 * never stored in the database. Three of them, and they are **not**
 * interchangeable:
 *
 * | Variable | Secret? | Used for |
 * | --- | --- | --- |
 * | `RAZORPAY_KEY_ID` | no — it reaches the browser | naming the account at checkout |
 * | `RAZORPAY_KEY_SECRET` | yes | API auth, and the checkout callback signature |
 * | `RAZORPAY_WEBHOOK_SECRET` | yes | the webhook signature, and *only* that |
 *
 * The webhook secret is separate from the key secret in Razorpay's own design,
 * and conflating them is a real and common mistake: verification then fails for
 * every webhook, which looks like Razorpay being broken rather than like a
 * configuration error.
 */

const API = "https://api.razorpay.com/v1";

/** How long any single Razorpay call may take before it is abandoned. */
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
 * A `RAZORPAY_MODE` variable beside the keys is a variable that can disagree
 * with them, and the direction it disagrees in — a live key with the mode left
 * on "test" — is the one that takes real money while every screen says it is a
 * sandbox. The prefix cannot be wrong, because it *is* the key.
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

function authHeader(): string {
  const id = keyId();
  const secret = keySecret();
  if (!id || !secret) {
    throw new PaymentError(
      "not-configured",
      "Payments are not configured on this server.",
      { retryable: false }
    );
  }
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

// ── Transport ─────────────────────────────────────────────────────────────

type RazorpayError = { error?: { code?: string; description?: string; reason?: string } };

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<T> {
  /**
   * Built **before** the try block, deliberately.
   *
   * `authHeader()` throws `not-configured` when a key is missing, and inside the
   * try that rejection was caught by the transport handler and relabelled
   * `unavailable` — so a deployment with no keys told its operator "Razorpay
   * could not be reached, try again in a moment" about a problem that will never
   * fix itself. A missing credential is not a transient failure and must not be
   * reported as one.
   */
  const authorization = authHeader();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      // A payment call must never be served from a cache, and Next patches
      // `fetch` to cache by default in some contexts.
      cache: "no-store",
    });
  } catch {
    if (controller.signal.aborted) {
      throw new PaymentError("timeout", "Razorpay did not respond in time.");
    }
    throw new PaymentError("unavailable", "Razorpay could not be reached.");
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as (T & RazorpayError) | null;

  if (!response.ok) throw errorFor(response.status, payload);
  if (!payload) {
    throw new PaymentError("unknown", "Razorpay returned a response that could not be read.");
  }

  return payload;
}

/**
 * Map a Razorpay failure onto the closed set.
 *
 * `description` is passed through for 400: it names the field that was wrong and
 * is the whole diagnosis. It is **not** passed through for 401 — that response
 * can echo the key id, and a credential has no business in a log line or an
 * error surfaced to a caller.
 */
function errorFor(status: number, payload: RazorpayError | null): PaymentError {
  const detail = payload?.error?.description;

  if (status === 400) {
    return new PaymentError("rejected", `Razorpay rejected the request${detail ? `: ${detail}` : "."}`, {
      retryable: false,
      status,
    });
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
  return new PaymentError("unknown", `Razorpay returned an unexpected status ${status}.`, { status });
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
  return call<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: input.amountPaise,
      currency: CURRENCY,
      receipt: input.receipt,
      /**
       * Auto-capture.
       *
       * Without it a payment lands `authorized` and has to be captured by a
       * second call, and an authorisation that is never captured is money held
       * on a student's card that silently expires. There is nothing to review
       * between authorisation and capture for a wallet top-up — the goods are a
       * number going up — so the two-step flow adds a failure mode and buys
       * nothing.
       */
      payment_capture: 1,
      notes: input.notes ?? {},
    },
  });
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
 * and a payment can be refunded between the webhook being sent and it arriving.
 */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
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
  return call<RazorpayRefund>(`/payments/${encodeURIComponent(input.paymentId)}/refund`, {
    method: "POST",
    body: {
      amount: input.amountPaise,
      /**
       * `normal`, not `optimum`. Instant refunds cost extra and land on the
       * same card either way; a campus wallet has no reason to pay for speed.
       */
      speed: "normal",
      notes: input.notes ?? {},
    },
  });
}

// ── Signatures ────────────────────────────────────────────────────────────

/**
 * Compare two hex digests without leaking how far they matched.
 *
 * `===` on a string returns as soon as two characters differ, and the time that
 * takes is measurable across enough requests — which is a way to derive a valid
 * signature one character at a time. `timingSafeEqual` compares every byte
 * regardless.
 *
 * It throws on a length mismatch, so the lengths are checked first; that check
 * leaks only the *length* of the supplied value, which an attacker already knows
 * because they chose it.
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
 * The bytes matter: `JSON.parse` then `JSON.stringify` reorders keys and drops
 * insignificant whitespace, and the digest of the round-tripped string does not
 * match the digest of what was sent. Every caller must read `await req.text()`
 * and hash *that*, before parsing.
 *
 * Keyed with `RAZORPAY_WEBHOOK_SECRET`, which is a different secret from the API
 * key secret.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = webhookSecret();
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
