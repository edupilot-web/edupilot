"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FieldError, FormMessage } from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { CheckCircleIcon, MailIcon } from "@/components/icons";
import { logoutAction } from "@/lib/auth-actions";
import {
  changeEmailAction,
  resendVerificationAction,
  type VerificationFormState,
} from "@/lib/verification-actions";

/**
 * The screen a new account lands on: what we sent, where, and the three ways
 * out of it — send it again, fix the address, or leave.
 *
 * A dead end here is expensive. The student cannot use the product, cannot
 * always see why, and has no password-reset flow to fall back on, so every
 * plausible reason the mail did not arrive gets an answer on this one screen.
 */
export function VerifyEmailPanel({
  email,
  next,
  initialNotice,
}: {
  email: string;
  next?: string;
  /** Carried in from a redirect, e.g. an expired link. */
  initialNotice?: { tone: "error" | "info"; message: string };
}) {
  const [resendState, resendAction, resending] = useActionState(
    resendVerificationAction,
    undefined
  );
  const [changeState, changeAction, changing] = useActionState(changeEmailAction, undefined);

  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // The most recent action wins the banner; the notice from the URL is only
  // shown until the user does something on this screen.
  const banner = pickBanner(changeState, resendState, initialNotice);
  const shownEmail = changeState?.status === "sent" ? newEmail.trim() || email : email;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
          <MailIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Check your email
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          We&apos;ve sent a verification link to
        </p>
        <p className="mt-1 break-all text-[14.5px] font-semibold text-slate-900 dark:text-white">
          {shownEmail}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          Please verify your email to continue.
        </p>
      </div>

      {banner &&
        (banner.tone === "success" ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          >
            <CheckCircleIcon className="mt-px h-4 w-4 shrink-0" />
            {banner.message}
          </div>
        ) : banner.tone === "info" ? (
          <p
            role="status"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
          >
            {banner.message}
          </p>
        ) : (
          <FormMessage>{banner.message}</FormMessage>
        ))}

      <form action={resendAction}>
        <SubmitButton pending={resending}>Resend email</SubmitButton>
      </form>

      <p className="text-center text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Didn&apos;t receive it? Check your spam folder — delivery can take a minute.
      </p>

      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        {editing ? (
          <form action={changeAction} className="space-y-3">
            <div>
              <label
                htmlFor="change-email"
                className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300"
              >
                New email address
              </label>
              <input
                id="change-email"
                name="email"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="you@college.edu"
                aria-invalid={changeState?.errors?.email ? true : undefined}
                aria-describedby={changeState?.errors?.email ? "change-email-error" : undefined}
                className={`w-full rounded-lg border bg-white py-2.5 px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 dark:bg-slate-900 dark:text-white ${
                  changeState?.errors?.email
                    ? "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
                    : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700"
                }`}
              />
              <FieldError id="change-email-error" messages={changeState?.errors?.email} />
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13.5px] font-medium text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={changing}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-[13.5px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {changing ? "Saving…" : "Update and resend"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Wrong address?
            </p>
            <button
              type="button"
              onClick={() => {
                setNewEmail(shownEmail);
                setEditing(true);
              }}
              className="rounded-md text-[13px] font-semibold text-blue-600 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-400"
            >
              Change email
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 text-[13px]">
        <Link
          href={next ? `/verify-email?next=${encodeURIComponent(next)}` : "/verify-email"}
          className="font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          I&apos;ve verified — continue
        </Link>
        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
          •
        </span>
        {/* Signing out is what "back to login" has to mean here: the session
            belongs to the account whose address is still unconfirmed. */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md font-medium text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Back to login
          </button>
        </form>
      </div>
    </div>
  );
}

type Banner = { tone: "success" | "error" | "info"; message: string };

function pickBanner(
  change: VerificationFormState | undefined,
  resend: VerificationFormState | undefined,
  initial?: { tone: "error" | "info"; message: string }
): Banner | null {
  const fromState = change?.message ? change : resend?.message ? resend : null;
  if (fromState?.message) {
    return {
      tone: fromState.status === "sent" ? "success" : fromState.status === "info" ? "info" : "error",
      message: fromState.message,
    };
  }
  return initial ?? null;
}
