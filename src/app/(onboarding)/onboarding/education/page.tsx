import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EducationForm } from "@/components/onboarding/education-form";
import { Stepper } from "@/components/onboarding/stepper";
import { getCurrentUser } from "@/lib/current-user";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = { title: "Your education · EduPilot" };

export default async function EducationStepPage(props: PageProps<"/onboarding/education">) {
  const user = await getCurrentUser();
  // The layout gates this too; repeated so the page never renders without a user.
  if (!user) redirect("/login");
  // A finished profile has nothing to do here, and a bookmarked step must not
  // become a way to overwrite one.
  if (user.profileCompleted) redirect("/dashboard");

  const { next } = await props.searchParams;
  const destination = next === undefined ? undefined : safeDestination(next);

  return (
    <div>
      <Stepper current="education" />

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Step 1 of 2
        </p>
        <h1 className="mt-1.5 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Let&apos;s build your student profile
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          Tell us a little about your education so we can personalize your experience.
        </p>

        <div className="mt-6">
          <EducationForm
            next={destination}
            defaults={{
              collegeId: user.profile?.collegeId ?? "",
              collegeName: user.profile?.collegeName ?? "",
              degree: user.profile?.degree ?? "",
              specialization: user.profile?.specialization ?? "",
            }}
          />
        </div>
      </div>
    </div>
  );
}
