"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { saveEducationDetails, saveProfileDetails } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/current-user";
import { safeDestination } from "@/lib/redirects";
import { educationFormSchema, profileFormSchema } from "@/lib/validation";

export type OnboardingFormState = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const GENERIC_FAILURE = "Something went wrong on our end. Please try again.";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Blank optional inputs are stored as null rather than "". */
function orNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

/** Step 1 of onboarding: name, phone, city. Advances to the education step. */
export async function saveProfileAction(
  _prevState: OnboardingFormState | undefined,
  formData: FormData
): Promise<OnboardingFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = profileFormSchema.safeParse({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    city: text(formData, "city"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const saved = await saveProfileDetails(user.id, {
      name: parsed.data.name,
      phone: orNull(parsed.data.phone),
      city: orNull(parsed.data.city),
    });
    if (!saved) return { message: GENERIC_FAILURE };
  } catch (err) {
    console.error("[onboarding] could not save the profile step:", err);
    return { message: GENERIC_FAILURE };
  }

  const next = text(formData, "next");
  redirect(next ? `/onboarding/education?next=${encodeURIComponent(next)}` : "/onboarding/education");
}

/**
 * Step 2: college, program, current year. This is the last step, so saving it
 * marks onboarding complete and releases the user into the app.
 */
export async function completeOnboardingAction(
  _prevState: OnboardingFormState | undefined,
  formData: FormData
): Promise<OnboardingFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = educationFormSchema.safeParse({
    college: text(formData, "college"),
    program: text(formData, "program"),
    currentYear: text(formData, "currentYear"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const saved = await saveEducationDetails(user.id, parsed.data);
    if (!saved) return { message: GENERIC_FAILURE };
  } catch (err) {
    console.error("[onboarding] could not save the education step:", err);
    return { message: GENERIC_FAILURE };
  }

  redirect(safeDestination(text(formData, "next")));
}
