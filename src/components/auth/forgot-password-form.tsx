"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage, TextField } from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { requestResetAction } from "@/lib/password-reset-actions";
import { MailIcon } from "@/components/icons";

/**
 * Asking for a reset link.
 *
 * The confirmation is deliberately vague about whether the address exists, and
 * the wording carries the weight: "if that address has an account" is honest
 * about the uncertainty rather than pretending to have sent something. Telling
 * the truth here would make the form a way to test whether any address in the
 * world belongs to a student.
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestResetAction, {});
  const [email, setEmail] = useState("");

  if (state.sent) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-[14px] font-semibold text-emerald-900 dark:text-emerald-200">
            Check your inbox
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-emerald-800 dark:text-emerald-300">
            If <strong>{email || "that address"}</strong> has an EduPilot account, a link to set a
            new password is on its way. It works once and expires in an hour.
          </p>
        </div>

        <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Nothing arrived? Check your spam folder, and make sure you typed the address you signed up
          with. You can ask again in a minute.
        </p>

        <Link
          href="/login"
          className="inline-block text-[13.5px] font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error && <FormMessage>{state.error}</FormMessage>}

      <p className="text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
        Enter the address you signed up with and we will send you a link to set a new password.
      </p>

      <TextField
        label="Email address"
        name="email"
        type="email"
        placeholder="Enter your email"
        autoComplete="email"
        icon={<MailIcon />}
        value={email}
        onChange={setEmail}
      />

      <SubmitButton pending={pending}>Send reset link</SubmitButton>

      <p className="text-center text-[13px] text-slate-500 dark:text-slate-400">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
