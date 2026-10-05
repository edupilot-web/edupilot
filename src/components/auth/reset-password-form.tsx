"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage, PasswordField } from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { resetPasswordAction } from "@/lib/password-reset-actions";
import { LockIcon } from "@/components/icons";

/**
 * Setting the new password.
 *
 * The token rides in a hidden field rather than being read from the URL by the
 * action: the page has already checked it is live before rendering this, so the
 * form is only ever shown for a link that will work. A student who follows a
 * stale link is told so before typing a password twice.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, {});
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error && <FormMessage>{state.error}</FormMessage>}

      <p className="text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
        Choose a new password. Signing in again afterwards will use it everywhere.
      </p>

      <PasswordField
        label="New password"
        name="password"
        placeholder="At least 8 characters"
        autoComplete="new-password"
        icon={<LockIcon />}
        value={password}
        onChange={setPassword}
      />

      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        placeholder="Type it again"
        autoComplete="new-password"
        icon={<LockIcon />}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />

      <SubmitButton pending={pending}>Set new password</SubmitButton>

      {/* Said before they commit, not after. Somebody resetting because they
          think another person is in their account should know this is the part
          that removes them. */}
      <p className="text-[12.5px] leading-relaxed text-slate-400 dark:text-slate-500">
        This signs you out on every device, including any you did not recognise.
      </p>

      <p className="text-center text-[13px] text-slate-500 dark:text-slate-400">
        <Link
          href="/login"
          className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
