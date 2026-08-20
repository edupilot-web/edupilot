"use client";

import { useActionState, useState } from "react";
import { FormMessage, TextField } from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { MailIcon, UserIcon } from "@/components/icons";
import { saveProfileAction } from "@/lib/onboarding-actions";

/**
 * Onboarding step 1. Name arrives prefilled — from the sign-up form, or from
 * the Google profile — so the common case is one glance and Continue.
 */
export function ProfileForm({
  defaults,
  email,
  next,
}: {
  defaults: { name: string; phone: string; city: string };
  email: string;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(saveProfileAction, undefined);

  const [name, setName] = useState(defaults.name);
  const [phone, setPhone] = useState(defaults.phone);
  const [city, setCity] = useState(defaults.city);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.message && <FormMessage>{state.message}</FormMessage>}

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

      {/* Read-only: the address is the account identifier and is changed in settings. */}
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
          Email address
        </label>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            value={email}
            readOnly
            aria-readonly="true"
            className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-[15px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
          />
        </div>
      </div>

      <TextField
        label="Phone number"
        name="phone"
        placeholder="+91 98765 43210"
        autoComplete="tel"
        hint="Optional"
        value={phone}
        onChange={setPhone}
        errors={state?.errors?.phone}
      />

      <TextField
        label="City"
        name="city"
        placeholder="Where are you based?"
        autoComplete="address-level2"
        hint="Optional"
        value={city}
        onChange={setCity}
        errors={state?.errors?.city}
      />

      <div className="pt-1">
        <SubmitButton pending={pending}>Continue</SubmitButton>
      </div>
    </form>
  );
}
