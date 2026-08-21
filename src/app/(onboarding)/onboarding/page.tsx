import { redirect } from "next/navigation";
import { ONBOARDING_FIRST_STEP } from "@/lib/auth-routing";

/** `/onboarding` is named in code and links; send it to the first step. */
export default function OnboardingIndexPage() {
  redirect(ONBOARDING_FIRST_STEP);
}
