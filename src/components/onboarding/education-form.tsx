"use client";

import { useActionState, useMemo, useState } from "react";
import { FormMessage, SelectField } from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { CollegeField } from "@/components/onboarding/college-field";
import { Combobox, type ComboboxOption } from "@/components/onboarding/combobox";
import { BookIcon } from "@/components/icons";
import { saveEducationAction } from "@/lib/onboarding-actions";
import { DEGREES, SPECIALIZATION_SUGGESTIONS } from "@/lib/user-fields";

const DEGREE_OPTIONS = DEGREES.map((degree) => ({ value: degree, label: degree }));

const SPECIALIZATION_OPTIONS: ComboboxOption[] = SPECIALIZATION_SUGGESTIONS.map((name) => ({
  id: name,
  label: name,
}));

/**
 * Onboarding step 1 — where the student studies and what they study.
 *
 * Both text fields accept anything: branch names differ between universities
 * far more than a fixed list can cover, and a student forced to pick the
 * nearest wrong option leaves us with data that reads as correct and is not.
 */
export function EducationForm({
  defaults,
  next,
}: {
  defaults: {
    collegeId: string;
    collegeName: string;
    degree: string;
    specialization: string;
  };
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(saveEducationAction, undefined);

  const [degree, setDegree] = useState(defaults.degree);
  const [specialization, setSpecialization] = useState(defaults.specialization);

  // Filtered in the browser: the list is a few dozen strings, so a round trip
  // per keystroke would be slower and no more accurate.
  const specializationMatches = useMemo(() => {
    const term = specialization.trim().toLowerCase();
    if (!term) return SPECIALIZATION_OPTIONS.slice(0, 8);
    return SPECIALIZATION_OPTIONS.filter((option) =>
      option.label.toLowerCase().includes(term)
    ).slice(0, 8);
  }, [specialization]);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="specialization" value={specialization.trim()} />

      {state?.message && <FormMessage>{state.message}</FormMessage>}

      <CollegeField
        defaults={{ collegeId: defaults.collegeId, collegeName: defaults.collegeName }}
        errors={state?.errors?.collegeName}
      />

      <SelectField
        label="Degree / Program"
        name="degree"
        placeholder="Select your degree"
        options={DEGREE_OPTIONS}
        value={degree}
        onChange={setDegree}
        errors={state?.errors?.degree}
      />

      <Combobox
        label="Specialization / Branch"
        icon={<BookIcon />}
        placeholder="e.g. Computer Science and Engineering"
        value={specialization}
        onChange={setSpecialization}
        options={specializationMatches}
        errors={state?.errors?.specialization}
        hint="Pick a suggestion or type your own."
      />

      <div className="pt-2">
        <SubmitButton pending={pending}>Continue</SubmitButton>
      </div>
    </form>
  );
}
