import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  creditKeyFor,
  formatPaise,
  isHandledEvent,
  isTerminalOrder,
  isValidPaise,
  refundKeyFor,
  toPaise,
  TRANSACTION_DIRECTION,
  TRANSACTION_TYPES,
  WALLET_LIMITS,
} from "../../src/lib/payments/fields";
import {
  isPaymentsConfigured,
  isWebhookConfigured,
  mode,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "../../src/lib/payments/razorpay";

/**
 * The payments invariants that do not need a database.
 *
 * Money and signatures. Both are places where a defect is silent — a rounding
 * error accumulates a paise at a time, and a signature check that always passes
 * looks exactly like one that works until somebody forges a webhook.
 */

const VARS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>): void {
  for (const name of VARS) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) process.env[name] = value;
  }
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("money", () => {
  it("converts rupees to paise as integers", () => {
    assert.equal(toPaise(10), 1000);
    assert.equal(toPaise(199.99), 19999);
    assert.equal(toPaise(0.01), 1);
  });

  it("refuses precision finer than a paise", () => {
    // 10.005 rupees is half a paise. Rounding it silently is how a ledger ends
    // up a rupee out over a term.
    assert.throws(() => toPaise(10.005), RangeError);
    assert.throws(() => toPaise(Number.NaN), RangeError);
    assert.throws(() => toPaise(Number.POSITIVE_INFINITY), RangeError);
  });

  it("survives the float that motivates integer paise", () => {
    // 0.1 + 0.2 === 0.30000000000000004. In paise it is exactly 30.
    assert.equal(toPaise(0.1) + toPaise(0.2), 30);
  });

  it("formats paise for an Indian reader", () => {
    assert.equal(formatPaise(1000), "₹10");
    assert.equal(formatPaise(19999), "₹199.99");
    assert.equal(formatPaise(10000000), "₹1,00,000");
    assert.equal(formatPaise(0), "₹0");
    assert.equal(formatPaise(-5000), "-₹50");
  });

  it("rejects amounts that are not usable paise", () => {
    assert.equal(isValidPaise(100), true);
    assert.equal(isValidPaise(0), false);
    assert.equal(isValidPaise(-100), false);
    assert.equal(isValidPaise(10.5), false);
    assert.equal(isValidPaise("100"), false);
    assert.equal(isValidPaise(Number.MAX_SAFE_INTEGER + 1), false);
  });

  it("keeps the limits ordered so no amount is both too small and too large", () => {
    assert.ok(WALLET_LIMITS.minTopUpPaise < WALLET_LIMITS.maxTopUpPaise);
    assert.ok(WALLET_LIMITS.maxTopUpPaise <= WALLET_LIMITS.maxBalancePaise);
    assert.ok(WALLET_LIMITS.maxTopUpPaise <= WALLET_LIMITS.maxDailyTopUpPaise);
  });
});

describe("the ledger vocabulary", () => {
  it("gives every transaction type a direction", () => {
    for (const type of TRANSACTION_TYPES) {
      assert.ok(TRANSACTION_DIRECTION[type], `${type} has no direction`);
    }
  });

  it("agrees that money in is a credit and money out is a debit", () => {
    assert.equal(TRANSACTION_DIRECTION.topup, "credit");
    assert.equal(TRANSACTION_DIRECTION.spend, "debit");
    // A refund leaves the wallet: the rupees go back to the card.
    assert.equal(TRANSACTION_DIRECTION.refund, "debit");
    assert.equal(TRANSACTION_DIRECTION.reversal, "credit");
  });

  it("scopes an idempotency key to one payment", () => {
    assert.equal(creditKeyFor("pay_ABC"), "razorpay:payment:pay_ABC");
    assert.notEqual(creditKeyFor("pay_ABC"), creditKeyFor("pay_ABD"));
    // A refund and a payment must never collide, or refunding would look like a
    // duplicate credit and be skipped.
    assert.notEqual(creditKeyFor("X"), refundKeyFor("X"));
  });

  it("treats a settled order as unchangeable", () => {
    assert.equal(isTerminalOrder("paid"), true);
    assert.equal(isTerminalOrder("failed"), true);
    assert.equal(isTerminalOrder("created"), false);
    assert.equal(isTerminalOrder("attempted"), false);
  });

  it("acts only on the webhook events it understands", () => {
    assert.equal(isHandledEvent("payment.captured"), true);
    assert.equal(isHandledEvent("refund.processed"), true);
    // Razorpay sends dozens more; acting on an unknown one is worse than not.
    assert.equal(isHandledEvent("subscription.charged"), false);
    assert.equal(isHandledEvent(""), false);
  });
});

describe("configuration", () => {
  it("needs both key halves before payments are considered set up", () => {
    setEnv({ RAZORPAY_KEY_ID: "rzp_test_abc" });
    assert.equal(isPaymentsConfigured(), false);

    setEnv({ RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "secret" });
    assert.equal(isPaymentsConfigured(), true);
  });

  it("treats the webhook secret as separate from the key secret", () => {
    // They are different secrets in Razorpay's own design, and conflating them
    // fails verification for every webhook.
    setEnv({ RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "secret" });
    assert.equal(isWebhookConfigured(), false);

    setEnv({ RAZORPAY_WEBHOOK_SECRET: "whsec" });
    assert.equal(isWebhookConfigured(), true);
  });

  it("reads test or live from the key itself", () => {
    setEnv({ RAZORPAY_KEY_ID: "rzp_test_abc" });
    assert.equal(mode(), "test");

    setEnv({ RAZORPAY_KEY_ID: "rzp_live_abc" });
    assert.equal(mode(), "live");
  });

  it("defaults to test when nothing is configured", () => {
    // The safe direction. A deployment that guessed "live" would present a real
    // payment form with no keys behind it.
    setEnv({});
    assert.equal(mode(), "test");
  });
});

describe("the checkout signature", () => {
  const SECRET = "test_key_secret";

  function sign(orderId: string, paymentId: string, secret = SECRET): string {
    return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  }

  it("accepts a signature made with the key secret", () => {
    setEnv({ RAZORPAY_KEY_SECRET: SECRET });
    assert.equal(
      verifyCheckoutSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: sign("order_1", "pay_1"),
      }),
      true
    );
  });

  it("rejects a signature for a different payment", () => {
    // The attack this stops: replaying one valid signature against another
    // order to have somebody else's payment credited to you.
    setEnv({ RAZORPAY_KEY_SECRET: SECRET });
    assert.equal(
      verifyCheckoutSignature({
        orderId: "order_1",
        paymentId: "pay_2",
        signature: sign("order_1", "pay_1"),
      }),
      false
    );
  });

  it("rejects a signature made with the wrong secret", () => {
    setEnv({ RAZORPAY_KEY_SECRET: SECRET });
    assert.equal(
      verifyCheckoutSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: sign("order_1", "pay_1", "someone_elses_secret"),
      }),
      false
    );
  });

  it("rejects everything when no secret is configured", () => {
    // Fails closed. A deployment with no secret must not accept every payment.
    setEnv({});
    assert.equal(
      verifyCheckoutSignature({ orderId: "o", paymentId: "p", signature: "anything" }),
      false
    );
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // `timingSafeEqual` throws on a length mismatch; a rejected payment must not
    // become a 500.
    setEnv({ RAZORPAY_KEY_SECRET: SECRET });
    assert.equal(
      verifyCheckoutSignature({ orderId: "o", paymentId: "p", signature: "short" }),
      false
    );
    assert.equal(verifyCheckoutSignature({ orderId: "o", paymentId: "p", signature: "" }), false);
  });
});

describe("the webhook signature", () => {
  const SECRET = "test_webhook_secret";
  const BODY = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}';

  function sign(body: string, secret = SECRET): string {
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  it("accepts a body signed with the webhook secret", () => {
    setEnv({ RAZORPAY_WEBHOOK_SECRET: SECRET });
    assert.equal(verifyWebhookSignature(BODY, sign(BODY)), true);
  });

  it("rejects a body that changed by one byte", () => {
    setEnv({ RAZORPAY_WEBHOOK_SECRET: SECRET });
    const tampered = BODY.replace("pay_1", "pay_2");
    assert.equal(verifyWebhookSignature(tampered, sign(BODY)), false);
  });

  it("rejects a re-serialised body", () => {
    /**
     * The reason every caller must hash `await req.text()` rather than the
     * parsed object. `JSON.parse` then `JSON.stringify` is not the identity: key
     * order and whitespace are not preserved, and the digest changes.
     */
    setEnv({ RAZORPAY_WEBHOOK_SECRET: SECRET });
    const spaced = '{ "event": "payment.captured" }';
    const reserialised = JSON.stringify(JSON.parse(spaced));

    assert.notEqual(spaced, reserialised);
    assert.equal(verifyWebhookSignature(reserialised, sign(spaced)), false);
  });

  it("rejects a body signed with the API key secret", () => {
    // The common misconfiguration, and it must fail rather than half-work.
    setEnv({ RAZORPAY_WEBHOOK_SECRET: SECRET, RAZORPAY_KEY_SECRET: "api_key_secret" });
    assert.equal(verifyWebhookSignature(BODY, sign(BODY, "api_key_secret")), false);
  });

  it("rejects a missing signature header", () => {
    setEnv({ RAZORPAY_WEBHOOK_SECRET: SECRET });
    assert.equal(verifyWebhookSignature(BODY, null), false);
    assert.equal(verifyWebhookSignature(BODY, ""), false);
  });

  it("rejects everything when no webhook secret is configured", () => {
    setEnv({});
    assert.equal(verifyWebhookSignature(BODY, sign(BODY)), false);
  });
});
