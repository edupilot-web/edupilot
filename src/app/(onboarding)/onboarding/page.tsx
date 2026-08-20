import { redirect } from "next/navigation";

/** `/onboarding` is named in code and links; send it to the first step. */
export default function OnboardingIndexPage() {
  redirect("/onboarding/profile");
}
