"use client";

import { useActionState, useState } from "react";
import { adminLoginAction } from "@/lib/admin/auth-actions";
import { FieldError, FormMessage } from "@/components/auth/fields";
import { LockIcon, MailIcon } from "@/components/icons";

const INPUT =
  "w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-[14.5px] text-slate-900 outline-none transition placeholder:text-slate-400 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500";
const IDLE =
  "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700";
const INVALID =
  "border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 dark:border-rose-500/60";

/**
 * Administrator sign-in.
 *
 * Every failure renders one message. The admin login page is the most valuable
 * enumeration target the platform has — "no such administrator" would confirm
 * which addresses hold administrative access — so a wrong password, an unknown
 * address, a deactivated account and a locked one are indistinguishable here.
 */
export function AdminLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(adminLoginAction, undefined);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.message && <FormMessage>{state.message}</FormMessage>}

      <div>
        <label
          htmlFor="admin-email"
          className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
        >
          Work email
        </label>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@edupilot.dev"
            aria-invalid={state?.errors?.email ? true : undefined}
            aria-describedby={state?.errors?.email ? "admin-email-error" : undefined}
            className={`${INPUT} ${state?.errors?.email ? INVALID : IDLE}`}
          />
        </div>
        <FieldError id="admin-email-error" messages={state?.errors?.email} />
      </div>

      <div>
        <label
          htmlFor="admin-password"
          className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
        >
          Password
        </label>
        <div className="relative">
          <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
            aria-invalid={state?.errors?.password ? true : undefined}
            aria-describedby={state?.errors?.password ? "admin-password-error" : undefined}
            className={`${INPUT} ${state?.errors?.password ? INVALID : IDLE}`}
          />
        </div>
        <FieldError id="admin-password-error" messages={state?.errors?.password} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-[14.5px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        {pending && (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
            <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        Sign in
      </button>
    </form>
  );
}
