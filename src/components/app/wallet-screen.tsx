"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPaise, TRANSACTION_TYPE_LABELS, type TransactionType } from "@/lib/payments/fields";

/**
 * The campus wallet.
 *
 * Razorpay Checkout is a hosted overlay: card details are entered inside an
 * iframe served by Razorpay and never touch this page, this bundle or this
 * server. That is the point of using it — nothing here is in PCI scope, because
 * nothing here can see a card number.
 *
 * What this component may be trusted with is therefore small, and it is
 * deliberately written that way:
 *
 * - it asks the server for an order and is told the amount back,
 * - it hands Razorpay the order id,
 * - it reports the result to the server, which re-checks everything.
 *
 * It never decides that a payment succeeded. The balance shown after a payment
 * is the one the *server* returned, not one added up here.
 */

type Transaction = {
  id: string;
  type: TransactionType;
  label: string;
  description: string;
  amountPaise: number;
  balanceAfterPaise: number | null;
  status: string;
  createdAt: string;
};

export type WalletData = {
  balancePaise: number;
  status: "active" | "frozen";
  transactions: Transaction[];
  nextCursor: string | null;
  paymentsEnabled: boolean;
  mode: "test" | "live";
  limits: { minTopUpPaise: number; maxTopUpPaise: number; maxBalancePaise: number };
  presetsPaise: readonly number[];
};

/** The slice of Razorpay Checkout this page uses. */
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: CheckoutResponse) => void;
  modal: { ondismiss: () => void };
};

type CheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * Load Razorpay Checkout once, on demand.
 *
 * Not `next/script` with `beforeInteractive`, and not a static import: this is a
 * third-party script on a page most students open to read a balance, and making
 * every one of them download it to look at a number is the wrong trade. It is
 * fetched when somebody actually intends to pay.
 */
function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function WalletScreen({ initial }: { initial: WalletData }) {
  const [balancePaise, setBalancePaise] = useState(initial.balancePaise);
  const [transactions, setTransactions] = useState(initial.transactions);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [amountRupees, setAmountRupees] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Guards a second checkout while one is open.
   *
   * A ref rather than state: `busy` re-renders, and the double-click this
   * prevents happens inside one render pass.
   */
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/wallet", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setBalancePaise(payload.data.balancePaise);
    setTransactions(payload.data.transactions);
    setCursor(payload.data.nextCursor);
  }, []);

  /**
   * Poll while a payment is settling.
   *
   * The webhook is what credits a payment the browser could not confirm — the
   * student closed the tab, the callback 500'd, the capture was a second slow.
   * Polling for a short window turns that into "it appeared" rather than "I paid
   * and nothing happened", without anyone having to reload.
   */
  useEffect(() => {
    if (!pending) return;

    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      attempts += 1;
      await refresh();
      if (cancelled) return;

      // ~30 seconds. Past that the webhook has either landed or something is
      // wrong that more polling will not fix.
      if (attempts >= 10) {
        setPending(false);
        return;
      }
      timer = setTimeout(tick, 3000);
    };

    let timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, refresh]);

  const amountPaise = (() => {
    const value = Number(amountRupees);
    if (!Number.isFinite(value) || value <= 0) return 0;
    // Rounded here only to validate the button state; the server re-derives it.
    return Math.round(value * 100);
  })();

  const withinLimits =
    amountPaise >= initial.limits.minTopUpPaise && amountPaise <= initial.limits.maxTopUpPaise;

  const topUp = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const ready = await loadCheckout();
      if (!ready) {
        setError("Could not reach the payment provider. Check your connection and try again.");
        return;
      }

      const created = await fetch("/api/wallet/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise }),
      });
      const payload = await created.json().catch(() => null);

      if (!created.ok) {
        setError(payload?.error?.message ?? "Could not start the payment.");
        return;
      }

      const order = payload.data;

      const checkout = new window.Razorpay!({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "EduPilot",
        description: "Campus wallet top-up",
        order_id: order.razorpayOrderId,
        prefill: order.prefill,
        theme: { color: "#2563eb" },

        handler: async (response) => {
          setBusy(true);
          setNote("Confirming your payment…");

          const verified = await fetch("/api/wallet/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const result = await verified.json().catch(() => null);

          if (verified.ok && result?.data?.settled) {
            setBalancePaise(result.data.balancePaise);
            setNote(`${formatPaise(result.data.creditedPaise)} added to your wallet.`);
            setAmountRupees("");
            await refresh();
          } else {
            /**
             * Not an error message.
             *
             * The money has left the student's account — telling them the
             * payment failed would be false, and it is the one thing that would
             * make them pay twice. The webhook settles it; the poll picks it up.
             */
            setNote("Payment received. Your balance will update in a moment.");
            setPending(true);
          }

          setBusy(false);
          inFlight.current = false;
        },

        modal: {
          ondismiss: () => {
            // Closing checkout is not a failure. The order simply ages out.
            setBusy(false);
            inFlight.current = false;
          },
        },
      });

      checkout.open();
    } catch {
      setError("Something went wrong starting the payment.");
    } finally {
      setBusy(false);
      // Left true when checkout is open; its own callbacks clear it.
      if (!window.Razorpay) inFlight.current = false;
    }
  };

  const loadMore = async () => {
    if (!cursor) return;
    const response = await fetch(`/api/wallet/transactions?cursor=${encodeURIComponent(cursor)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    setTransactions((current) => [...current, ...payload.data.transactions]);
    setCursor(payload.data.nextCursor);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Campus Wallet
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          Add money once, pay for campus services without reaching for a card.
        </p>
      </header>

      {initial.mode === "test" && initial.paymentsEnabled && (
        /* Said plainly. A test wallet that looks identical to a live one is how
           somebody eventually demonstrates a "payment" with a real card. */
        <Banner tone="warn">
          Test mode — no real money moves. Use Razorpay&apos;s test cards.
        </Banner>
      )}
      {initial.status === "frozen" && (
        <Banner tone="warn">This wallet is on hold. Contact support.</Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {note && !error && <Banner tone="ok">{note}</Banner>}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Balance
        </p>
        <p className="mt-1 text-[34px] font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">
          {formatPaise(balancePaise)}
        </p>
        {pending && (
          <p className="mt-1 text-[13px] text-amber-600 dark:text-amber-400">
            A payment is being confirmed…
          </p>
        )}

        {!initial.paymentsEnabled ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            Payments are not set up on this deployment yet. Your balance and statement work; adding
            money does not.
          </p>
        ) : initial.status === "frozen" ? null : (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              {initial.presetsPaise.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmountRupees(String(preset / 100))}
                  className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-medium transition ${
                    amountPaise === preset
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {formatPaise(preset)}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700">
                <span className="text-[15px] text-slate-400">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={initial.limits.minTopUpPaise / 100}
                  max={initial.limits.maxTopUpPaise / 100}
                  step="1"
                  value={amountRupees}
                  onChange={(event) => setAmountRupees(event.target.value)}
                  placeholder="Amount"
                  className="w-full bg-transparent text-[15px] text-slate-900 outline-none dark:text-white"
                />
              </label>

              <button
                type="button"
                onClick={topUp}
                disabled={busy || !withinLimits}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Opening…" : "Add money"}
              </button>
            </div>

            <p className="mt-2 text-[12.5px] text-slate-400 dark:text-slate-500">
              {formatPaise(initial.limits.minTopUpPaise)} to{" "}
              {formatPaise(initial.limits.maxTopUpPaise)} at a time. Cards, UPI and net banking.
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[16.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Statement
        </h2>

        {transactions.length ? (
          <>
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-slate-900 dark:text-white">
                      {entry.description}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">
                      {TRANSACTION_TYPE_LABELS[entry.type]} ·{" "}
                      {new Date(entry.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {entry.status === "failed" && " · failed"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-[14px] font-semibold tabular-nums ${
                        entry.status === "failed"
                          ? "text-slate-400 line-through dark:text-slate-600"
                          : entry.amountPaise > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {entry.amountPaise > 0 ? "+" : ""}
                      {formatPaise(entry.amountPaise)}
                    </p>
                    {entry.balanceAfterPaise !== null && entry.status !== "failed" && (
                      <p className="text-[12px] text-slate-400 tabular-nums dark:text-slate-500">
                        {formatPaise(entry.balanceAfterPaise)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {cursor && (
              <button
                type="button"
                onClick={loadMore}
                className="mt-3 text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                Show older
              </button>
            )}
          </>
        ) : (
          <p className="mt-3 text-[14px] text-slate-500 dark:text-slate-400">
            Nothing yet. Money you add and payments you make will appear here.
          </p>
        )}
      </section>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";

  return (
    <p className={`rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${styles}`}>
      {children}
    </p>
  );
}
