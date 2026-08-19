"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction } from "@/lib/auth-actions";
import { CheckboxField, FormMessage, PasswordField, TextField } from "@/components/auth/fields";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { SubmitButton } from "@/components/auth/submit-button";
import { LockIcon, MailIcon } from "@/components/icons";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  // Held in state rather than left uncontrolled: React resets an uncontrolled
  // form once the action settles, which would clear the email on a failed
  // attempt and make the user retype it.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  return (
    <div className="space-y-6">
      <form action={formAction} noValidate className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

        {state?.message && <FormMessage>{state.message}</FormMessage>}

        <TextField
          label="Email address"
          name="email"
          type="email"
          placeholder="Enter your email"
          autoComplete="email"
          icon={<MailIcon />}
          value={email}
          onChange={setEmail}
          errors={state?.errors?.email}
        />

        <PasswordField
          label="Password"
          name="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          icon={<LockIcon />}
          value={password}
          onChange={setPassword}
          errors={state?.errors?.password}
        >
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="text-[12.5px] font-medium text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
            >
              Forgot password?
            </Link>
          </div>
        </PasswordField>

        <CheckboxField name="remember" checked={remember} onChange={setRemember}>
          Remember me
        </CheckboxField>

        <div className="pt-1">
          <SubmitButton pending={pending}>Login</SubmitButton>
        </div>
      </form>

      <SocialSignIn label="or continue with" />

      <p className="text-center text-[13px] text-slate-500 dark:text-slate-400">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
