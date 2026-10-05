"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signupAction } from "@/lib/auth-actions";
import { CheckboxField, FormMessage, PasswordField, TextField } from "@/components/auth/fields";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { SubmitButton } from "@/components/auth/submit-button";
import { MailIcon, UserIcon } from "@/components/icons";

export function SignupForm({
  next,
  notice,
  referralCode,
}: {
  next?: string;
  notice?: string;
  /** From `?ref=` on the invite link. Carried through the form untouched. */
  referralCode?: string;
}) {
  const [state, formAction, pending] = useActionState(signupAction, undefined);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [terms, setTerms] = useState(false);

  return (
    <div className="space-y-6">
      <form action={formAction} noValidate className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        {referralCode && <input type="hidden" name="ref" value={referralCode} />}

        {/* A failed submit outranks a notice carried in from the URL. */}
        {(state?.message ?? notice) && <FormMessage>{state?.message ?? notice}</FormMessage>}

        <TextField
          label="Full name"
          name="name"
          placeholder="Enter your full name"
          autoComplete="name"
          icon={<UserIcon />}
          value={name}
          onChange={setName}
          errors={state?.errors?.name}
        />

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
          placeholder="Create a password"
          autoComplete="new-password"
          hint="At least 8 characters with a number"
          value={password}
          onChange={setPassword}
          errors={state?.errors?.password}
        />

        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          placeholder="Confirm your password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          errors={state?.errors?.confirmPassword}
        />

        <CheckboxField name="terms" checked={terms} onChange={setTerms} errors={state?.errors?.terms}>
          I agree to the{" "}
          <Link
            href="/terms"
            className="font-medium text-blue-600 transition hover:underline dark:text-blue-400"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="font-medium text-blue-600 transition hover:underline dark:text-blue-400"
          >
            Privacy Policy
          </Link>
        </CheckboxField>

        <div className="pt-1">
          <SubmitButton pending={pending}>Create account</SubmitButton>
        </div>
      </form>

      <SocialSignIn label="or sign up with" next={next} />

      <p className="text-center text-[13px] text-slate-500 dark:text-slate-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          Login
        </Link>
      </p>
    </div>
  );
}
