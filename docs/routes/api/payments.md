# `/api/wallet/*`, `/api/webhooks/razorpay` — payments

| | |
| --- | --- |
| Files | [wallet/](../../../src/app/api/wallet/), [webhooks/razorpay/](../../../src/app/api/webhooks/razorpay/), [admin/payments/](../../../src/app/api/admin/payments/) |
| Services | [payments/](../../../src/lib/payments/) — `razorpay.ts`, `wallet.ts`, `orders.ts`, `admin.ts` |
| Models | [Wallet.ts](../../../src/models/Wallet.ts), [PaymentOrder.ts](../../../src/models/PaymentOrder.ts) |
| Design | [TECHNICAL.md §6.14](../../TECHNICAL.md) |

Three rules run through every endpoint here.

**The amount is decided once, on the server, and read back from our own row.**
Nothing a browser or a webhook sends is ever believed about how much money
changed hands. A client that could send an amount at verification time could pay
₹10 and be credited ₹10,000 — and no signature check would catch it, because the
signature is over ids, not amounts.

**The webhook is authoritative; the browser callback is a convenience.** If
`/api/wallet/verify` were deleted tomorrow, no money would be lost — students
would see their balance update a few seconds later instead of instantly.

**Money is integer paise.** `0.1 + 0.2 !== 0.3`, and a wallet that accumulates a
thousandth of a rupee per top-up is one that gets reconciled by hand.

---

## `POST /api/wallet/orders`

Opens a Razorpay order. Returns what Checkout needs and nothing more.

```json
{
  "data": {
    "razorpayOrderId": "order_…",
    "amountPaise": 50000,
    "currency": "INR",
    "keyId": "rzp_test_…",
    "mode": "test",
    "prefill": { "name": "…", "email": "…" }
  }
}
```

`keyId` is public by design — Checkout needs it in the browser to name the
account, and it authorises nothing on its own. The **key secret** is never
returned by any endpoint, and there is deliberately none that would.

Four limits are checked before an order exists, all server-side: the per-top-up
minimum and maximum, the holding cap, and a daily cap counted **from the ledger
rather than from orders**. Orders are cheap to create and most are abandoned;
counting them would lock out a student who opened and closed Checkout ten times
having spent nothing.

| Status | When |
| --- | --- |
| 200 | order created |
| 401 | no session |
| 422 | the amount is outside the limits, the wallet is frozen, or a cap is hit |
| 429 | too many orders this hour |
| 503 | Razorpay is not configured on this deployment |

The 429 is not fraud prevention — Razorpay handles that. Each call creates a real
order on a third-party account, and a loop would fill the dashboard with
thousands of abandoned orders and eat the API quota real payments need.

---

## `POST /api/wallet/verify`

The browser reporting that it paid. Three checks before a rupee moves, in order:

1. **The signature** — HMAC-SHA256 of `order_id|payment_id` with the key secret.
   It is what makes anything the browser says credible at all.
2. **That the order is this session's.** The signature proves Razorpay saw the
   payment; it says nothing about who is asking. Without this, someone holding
   one valid signature could settle it against another session — and since
   settlement credits the *order owner*, the effect would be to leak that another
   student had paid.
3. **What Razorpay says the payment is worth now**, re-fetched rather than taken
   from the request. A signature proves a message came from Razorpay; it does not
   prove the payment is still captured.

**202, not an error**, when the payment is real but has not settled yet.
Auto-capture resolves within seconds and the webhook finishes the job regardless,
so this is progress rather than failure — and the screen polls rather than
telling a student who has just paid that something went wrong.

---

## `POST /api/webhooks/razorpay`

The authoritative settlement path. A student who pays and immediately closes
their laptop is credited by this route and nothing else.

Four things make it safe, and all four are load-bearing:

| | |
| --- | --- |
| **No session** | Razorpay has no cookie. The signature *is* the authentication. |
| **Raw body** | The HMAC is over the exact bytes. `await req.text()` first, parse second. |
| **Idempotent** | Razorpay delivers at least once and retries anything non-2xx. |
| **2xx for the unhandled** | An unknown event answered with an error is retried forever and eventually gets the endpoint disabled — taking the events we *do* want down with it. |

Signed with `RAZORPAY_WEBHOOK_SECRET`, which is a **different secret** from the
API key secret. Conflating them is a common mistake and fails verification for
every webhook, which looks like Razorpay being broken rather than like a
configuration error.

**With no webhook secret set, the endpoint returns 503 and refuses to act.** An
unverified request that credits a wallet is an open door to free money, and the
503 makes Razorpay retry — so payments arriving during a misconfiguration are not
lost once it is fixed.

Events handled: `payment.captured`, `order.paid`, `payment.failed`,
`refund.processed`, `refund.failed`. Everything else is acknowledged and ignored.

The response is sent **before** the work runs, through `after()`. Razorpay times
out a slow webhook and retries it, so settling inline would turn one slow API
call into a duplicate delivery.

### Out-of-order delivery

`payment.failed` for a first attempt can arrive *after* `payment.captured` for
the retry that succeeded. Every status write is conditional on the order not
already being terminal, so a late failure cannot mark a paid order failed and
tell a student their money vanished.

---

## Idempotency, concretely

A unique index on `WalletTransaction.idempotencyKey` (`razorpay:payment:pay_XYZ`)
means a retried webhook writes nothing the second time. It is a **database**
guarantee rather than a check the caller has to remember, which matters because
the caller is a webhook — the code most likely to run twice.

The write is two steps and **the order is the safety property**:

1. Insert the ledger row, unapplied. A duplicate collides here and stops.
2. `$inc` the cached balance.
3. Mark the row applied.

A crash between 1 and 2 leaves money recorded but not landed — recoverable, and
found by `npm run reconcile:wallets`. Incrementing first would make the same
crash a double credit, which nothing can detect afterwards. **Under-crediting is
recoverable; over-crediting is not.**

A debit carries its balance check *inside the update filter*, so "check" and
"reduce" are one atomic operation. Ten concurrent ₹60 spends against ₹100 leave
exactly one succeeding — [tested](../../../tests/integration/wallet-ledger.test.ts),
because it is a property of MongoDB under concurrency rather than of the
TypeScript.

---

## `GET /api/wallet`, `GET /api/wallet/transactions`

Balance, statement, and the limits the screen renders from — so the UI cannot
offer a top-up the server would refuse. Cursor pagination on `createdAt`, not
`skip`: a statement grows at the top, so an offset shifts under the reader every
time a payment lands.

Scoped to the session's user inside the query. There is no parameter that widens
it, because there is no version of this question about someone else's money.

---

## Admin

### `GET /api/admin/payments` — `payment.view`

The ledger across every wallet, with the totals a reconciliation starts from.

### `POST /api/admin/payments/refund` — `payment.refund`

Its own permission, because this is the one admin action that moves real money
outward. A read-only admin sees everything and refunds nothing. `reason` is
required by the schema: an unexplained refund is indistinguishable from a mistake
six months later.

Checked **twice** before Razorpay is called, because money in a wallet is
fungible — a student may have topped up ₹500 and spent ₹400:

- against the **payment**, since Razorpay will not return more than was taken;
- against the **balance**, since returning money already spent on campus would
  leave the wallet negative and the platform out of pocket.

The wallet is debited when `refund.processed` arrives, **not** when the refund is
requested. A refund can be requested and then fail at the bank; debiting on
request would leave a student short of money that never left.

`payment.adjust` is deliberately **not** in any preset below Super Admin. A
refund leaves a matching record at Razorpay and is reconcilable from outside this
system; an adjustment invents a balance with nothing behind it.
