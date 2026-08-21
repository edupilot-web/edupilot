"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ONBOARDING_DONE_PATH,
  ONBOARDING_SECOND_STEP,
  VERIFY_EMAIL_PATH,
  withNext,
} from "@/lib/auth-routing";
import { getCurrentUser } from "@/lib/current-user";
import { saveAcademicStep, saveEducationStep } from "@/lib/student-profile";
import { academicStepSchema, educationStepSchema } from "@/lib/validation";
import type { StudyStatus } from "@/lib/user-fields";

export type OnboardingFormState = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const GENERIC_FAILURE = "Something went wrong on our end. Please try again.";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Every onboarding write starts here.
 *
 * The forms live behind a layout that already checks these, but a Server Action
 * is a public endpoint reachable with nothing but a session cookie — the layout
 * that rendered the form is not in the request path when the action runs.
 */
async function requireOnboardingUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.needsEmailVerification) redirect(VERIFY_EMAIL_PATH);
  return user;
}

/** Step 1: college, degree, specialization. Advances to the academic step. */
export async function saveEducationAction(
  _prevState: OnboardingFormState | undefined,
  formData: FormData
): Promise<OnboardingFormState> {
  const user = await requireOnboardingUser();

  const parsed = educationStepSchema.safeParse({
    collegeId: text(formData, "collegeId"),
    collegeName: text(formData, "collegeName"),
    degree: text(formData, "degree"),
    specialization: text(formData, "specialization"),
  });

  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    // The id is a hidden field the student never sees; an error on it belongs
    // next to the college box they can actually do something about.
    if (errors.collegeId && !errors.collegeName) {
      errors.collegeName = ["We could not match that college. Try searching again."];
    }
    delete errors.collegeId;
    return { errors };
  }

  try {
    await saveEducationStep(user.id, {
      collegeId: parsed.data.collegeId || null,
      collegeName: parsed.data.collegeName,
      degree: parsed.data.degree,
      specialization: parsed.data.specialization,
    });
  } catch (err) {
    console.error("[onboarding] could not save the education step:", err);
    return { message: GENERIC_FAILURE };
  }

  redirect(withNext(ONBOARDING_SECOND_STEP, text(formData, "next")));
}

/**
 * Step 2: where the student is in the course, and when they finish. This is the
 * last step, so a valid submission completes the profile and opens the app.
 */
export async function completeOnboardingAction(
  _prevState: OnboardingFormState | undefined,
  formData: FormData
): Promise<OnboardingFormState> {
  const user = await requireOnboardingUser();

  const parsed = academicStepSchema.safeParse({
    studyStatus: text(formData, "studyStatus"),
    currentYear: text(formData, "currentYear"),
    graduationYear: text(formData, "graduationYear"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const saved = await saveAcademicStep(user.id, {
      studyStatus: parsed.data.studyStatus as StudyStatus,
      currentYear: parsed.data.currentYear,
      graduationYear: parsed.data.graduationYear,
    });

    if (!saved) {
      // No profile to merge into: step 1 was never submitted. Send them back to
      // it rather than reporting a failure they cannot act on.
      redirect(withNext("/onboarding/education", text(formData, "next")));
    }
  } catch (err) {
    // redirect() unwinds by throwing; letting that reach the log would report a
    // successful hand-off as an error.
    if (isRedirectError(err)) throw err;
    console.error("[onboarding] could not save the academic step:", err);
    return { message: GENERIC_FAILURE };
  }

  redirect(withNext(ONBOARDING_DONE_PATH, text(formData, "next")));
}

/** Next.js signals a redirect from a Server Action by throwing this. */
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
