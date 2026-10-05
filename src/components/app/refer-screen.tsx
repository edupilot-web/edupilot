"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPaise } from "@/lib/payments/fields";
import { REJECTION_REASONS, shareMessageFor } from "@/lib/referrals/fields";

/**
 * Refer & Earn.
 *
 * The screen's job is to get a link out of the building, so the share row leads
 * and everything else is underneath it. The stats matter less than they look:
 * somebody opening this has either come to invite a friend or to check whether
 * one arrived, and both are answered above the fold.
 *
 * It is deliberately honest about **when** the reward lands. "Earn ₹50" next to
 * a list of signups that have not paid is how a referral programme generates
 * complaints; saying "when they finish setting up their profile" costs one line
 * and removes the surprise.
 */

export type ReferSummary = {
  code: string;
  shareUrl: string;
  signups: number;
  rewarded: number;
  pending: number;
  earnedPaise: number;
  remaining: number;
  cap: number;
  rewardsEnabled: boolean;
  referrerRewardPaise: number;
  refereeRewardPaise: number;
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

export function ReferScreen({ summary }: { summary: ReferSummary }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const message = shareMessageFor(summary.shareUrl, summary.refereeRewardPaise);

  const copy = async (what: "link" | "code", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access is refused in some browsers and over plain http. The
      // code and the link are both on screen as selectable text, so there is
      // always a way through without this.
      setCopied(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Refer &amp; Earn
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          {summary.rewardsEnabled ? (
            <>
              Invite a friend. When they finish setting up their profile, you get{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {formatPaise(summary.referrerRewardPaise)}
              </strong>{" "}
              in your campus wallet and they get{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {formatPaise(summary.refereeRewardPaise)}
              </strong>
              .
            </>
          ) : (
            "Invite a friend to EduPilot and see who joins."
          )}
        </p>
      </header>

      {!summary.eligible && (
        /**
         * Said up front, not discovered later.
         *
         * A student whose own profile is unfinished can share all they like and
         * will never be paid. Finding that out after three friends have joined
         * is the worst possible order to learn it in.
         */
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Finish your own academic profile before you can earn referral rewards. You can still share
          your link — the rewards will follow once you are set up.{" "}
          <Link href="/profile" className="font-semibold underline">
            Finish my profile
          </Link>
        </p>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Your invite code
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-slate-100 px-4 py-2.5 font-mono text-[20px] font-bold tracking-[0.2em] text-slate-900 dark:bg-slate-800 dark:text-white">
            {summary.code}
          </code>
          <button
            type="button"
            onClick={() => void copy("code", summary.code)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
        </div>

        <p className="mt-4 text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Or send the link
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={summary.shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Your referral link"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
          <button
            type="button"
            onClick={() => void copy("link", summary.shareUrl)}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-blue-700"
          >
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {/* `noopener` on every outbound share: these open a third-party tab
              that would otherwise get a handle on this window. */}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Share on WhatsApp
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent("Join me on EduPilot")}&body=${encodeURIComponent(message)}`}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Email it
          </a>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Signed up" value={String(summary.signups)} />
        <Stat label="Rewards paid" value={String(summary.rewarded)} />
        <Stat
          label="Earned"
          value={summary.rewardsEnabled ? formatPaise(summary.earnedPaise) : "—"}
        />
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Who you have invited
          </h2>
          {summary.rewardsEnabled && (
            <span className="text-[12.5px] text-slate-400 dark:text-slate-500">
              {summary.remaining} of {summary.cap} rewards left
            </span>
          )}
        </div>

        {summary.invites.length ? (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {summary.invites.map((invite) => (
              <li key={invite.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] text-slate-900 dark:text-white">
                    {invite.name ?? "Someone"}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">
                    {invite.status === "pending"
                      ? "Signed up — waiting for them to finish their profile"
                      : invite.status === "rewarded"
                        ? `Joined ${formatDate(invite.joinedAt)}`
                        : (REJECTION_REASONS[
                            invite.rejectionReason as keyof typeof REJECTION_REASONS
                          ] ?? "Not eligible")}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                    invite.status === "rewarded"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : invite.status === "pending"
                        ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {invite.status === "rewarded" && invite.rewardPaise > 0
                    ? `+${formatPaise(invite.rewardPaise)}`
                    : invite.status === "pending"
                      ? "Pending"
                      : "Not eligible"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-slate-500 dark:text-slate-400">
            Nobody yet. Send your link to a friend on your course — they get set up in a couple of
            minutes.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[16.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
          How it works
        </h2>
        <ol className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
          <Step n={1}>Send your link or your code to a friend.</Step>
          <Step n={2}>They sign up with it.</Step>
          <Step n={3}>
            They add their college and course.{" "}
            {summary.rewardsEnabled
              ? "That is when both of you are paid — not before."
              : "That is when the referral counts."}
          </Step>
        </ol>

        {summary.rewardsEnabled && (
          <p className="mt-3.5 border-t border-slate-100 pt-3 text-[12.5px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
            Rewards go into your campus wallet, up to {summary.cap} friends. Inviting yourself with a
            second email does not work, and somebody who was already invited by another student
            counts for them, not you.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[12px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
