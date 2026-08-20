"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage, SelectField, TextField } from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { BookIcon, ChevronLeftIcon } from "@/components/icons";
import { completeOnboardingAction } from "@/lib/onboarding-actions";
import { MAX_STUDY_YEAR, MIN_STUDY_YEAR, PROGRAMS } from "@/lib/user-fields";

const PROGRAM_OPTIONS = PROGRAMS.map((program) => ({ value: program, label: program }));

const YEAR_OPTIONS = Array.from(
  { length: MAX_STUDY_YEAR - MIN_STUDY_YEAR + 1 },
  (_, index) => MIN_STUDY_YEAR + index
).map((year) => ({
  value: String(year),
  label: `Year ${year}`,
}));

/**
 * Onboarding step 2 — the College / Program / Current year branch. Submitting
 * this marks onboarding complete, so the button says so.
 */
export function EducationForm({
  defaults,
  next,
}: {
  defaults: { college: string; program: string; currentYear: string };
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, undefined);

  const [college, setCollege] = useState(defaults.college);
  const [program, setProgram] = useState(defaults.program);
  const [currentYear, setCurrentYear] = useState(defaults.currentYear);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.message && <FormMessage>{state.message}</FormMessage>}

      <TextField
        label="College or university"
        name="college"
        placeholder="e.g. Indian Institute of Technology, Bombay"
        autoComplete="organization"
        icon={<BookIcon />}
        value={college}
        onChange={setCollege}
        errors={state?.errors?.college}
      />

      <SelectField
        label="Program"
        name="program"
        placeholder="Choose your program"
        options={PROGRAM_OPTIONS}
        value={program}
        onChange={setProgram}
        errors={state?.errors?.program}
      />

      <SelectField
        label="Current year"
        name="currentYear"
        placeholder="Choose your current year"
        options={YEAR_OPTIONS}
        value={currentYear}
        onChange={setCurrentYear}
        errors={state?.errors?.currentYear}
      />

      <div className="flex items-center gap-3 pt-1">
        <Link
          href={next ? `/onboarding/profile?next=${encodeURIComponent(next)}` : "/onboarding/profile"}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-[14px] font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </Link>
        <div className="flex-1">
          <SubmitButton pending={pending}>Finish setup</SubmitButton>
        </div>
      </div>
    </form>
  );
}
