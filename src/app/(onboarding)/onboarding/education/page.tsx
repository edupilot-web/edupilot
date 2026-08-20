import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EducationForm } from "@/components/onboarding/education-form";
import { Stepper } from "@/components/onboarding/stepper";
import { getCurrentUser } from "@/lib/current-user";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = { title: "Education details · EduPilot" };

export default async function EducationStepPage(props: PageProps<"/onboarding/education">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { next } = await props.searchParams;
  const destination = next === undefined ? undefined : safeDestination(next);

  return (
    <div>
      <Stepper current="education" />

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Education details
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          We use these to tailor your curriculum, placements and timetable.
        </p>

        <div className="mt-6">
          <EducationForm
            next={destination}
            defaults={{
              college: user.education?.college ?? "",
              program: user.education?.program ?? "",
              currentYear: user.education ? String(user.education.currentYear) : "",
            }}
          />
        </div>
      </div>
    </div>
  );
}
