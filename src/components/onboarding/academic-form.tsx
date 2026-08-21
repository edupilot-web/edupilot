"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { FormMessage, SelectField } from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { ChevronLeftIcon } from "@/components/icons";
import { completeOnboardingAction } from "@/lib/onboarding-actions";
import {
  MAX_STUDY_YEAR,
  MIN_STUDY_YEAR,
  STUDY_YEAR_LABELS,
  graduationYearOptions,
  type StudyStatus,
} from "@/lib/user-fields";

const YEAR_OPTIONS = Array.from(
  { length: MAX_STUDY_YEAR - MIN_STUDY_YEAR + 1 },
  (_, index) => MIN_STUDY_YEAR + index
).map((year) => ({ value: String(year), label: STUDY_YEAR_LABELS[year] ?? `Year ${year}` }));

const STATUS_CHOICES: { value: StudyStatus; label: string; description: string }[] = [
  {
    value: "studying",
    label: "Currently studying",
    description: "I'm partway through my course",
  },
  {
    value: "graduated",
    label: "Graduated",
    description: "I've already finished",
  },
];

/**
 * Onboarding step 2 — where the student is in their course, and when it ends.
 *
 * The form branches on status rather than offering "Graduated" as one more
 * entry in the year list: a graduate has no current year, and their graduation
 * year is a fact rather than an estimate. Keeping the two apart is what lets
 * the year selector offer sensible options in each case instead of every year
 * from 1950 to 2034.
 */
export function AcademicForm({
  defaults,
  next,
}: {
  defaults: {
    studyStatus: StudyStatus;
    currentYear: string;
    graduationYear: string;
  };
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, undefined);

  const [studyStatus, setStudyStatus] = useState<StudyStatus>(defaults.studyStatus);
  const [currentYear, setCurrentYear] = useState(defaults.currentYear);
  const [graduationYear, setGraduationYear] = useState(defaults.graduationYear);

  const studying = studyStatus === "studying";

  const yearOptions = useMemo(
    () =>
      graduationYearOptions(studyStatus).map((year) => ({
        value: String(year),
        label: String(year),
      })),
    [studyStatus]
  );

  function changeStatus(value: StudyStatus) {
    setStudyStatus(value);
    // A year that was valid under the old status is usually wrong under the new
    // one — an expected 2028 makes no sense for someone who has graduated. The
    // options for the *new* status are recomputed here rather than read from
    // `yearOptions`, which still describes the status being left behind.
    const allowed = graduationYearOptions(value);
    if (!allowed.some((year) => String(year) === graduationYear)) {
      setGraduationYear("");
    }
    if (value === "graduated") setCurrentYear("");
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="studyStatus" value={studyStatus} />

      {state?.message && <FormMessage>{state.message}</FormMessage>}

      <fieldset>
        <legend className="mb-2 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
          Current status
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {STATUS_CHOICES.map((choice) => {
            const selected = studyStatus === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => changeStatus(choice.value)}
                aria-pressed={selected}
                className={`rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${
                  selected
                    ? "border-blue-500 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-500/10"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                }`}
              >
                <span
                  className={`block text-[14px] font-semibold ${
                    selected
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {choice.label}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-slate-500 dark:text-slate-400">
                  {choice.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {studying && (
        <SelectField
          label="Current year"
          name="currentYear"
          placeholder="Choose your current year"
          options={YEAR_OPTIONS}
          value={currentYear}
          onChange={setCurrentYear}
          errors={state?.errors?.currentYear}
        />
      )}

      <SelectField
        label={studying ? "Expected graduation" : "Year of graduation"}
        name="graduationYear"
        placeholder={studying ? "Choose your expected year" : "Choose the year you graduated"}
        options={yearOptions}
        value={graduationYear}
        onChange={setGraduationYear}
        errors={state?.errors?.graduationYear}
      />

      <div className="flex items-center gap-3 pt-1">
        <Link
          href={next ? `/onboarding/education?next=${encodeURIComponent(next)}` : "/onboarding/education"}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-[14px] font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </Link>
        <div className="flex-1">
          <SubmitButton pending={pending}>Complete profile</SubmitButton>
        </div>
      </div>
    </form>
  );
}
