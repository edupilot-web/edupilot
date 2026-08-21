import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcademicForm } from "@/components/onboarding/academic-form";
import { Stepper } from "@/components/onboarding/stepper";
import { getCurrentUser } from "@/lib/current-user";
import { safeDestination } from "@/lib/redirects";
import { withNext } from "@/lib/auth-routing";

export const metadata: Metadata = { title: "Academic information · EduPilot" };

export default async function AcademicStepPage(props: PageProps<"/onboarding/academic">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profileCompleted) redirect("/dashboard");

  const { next } = await props.searchParams;
  const destination = next === undefined ? undefined : safeDestination(next);

  // Step 2 saves into the row step 1 creates. Arriving here first — from a
  // bookmark, or by typing the URL — has nothing to write to, so send them back
  // rather than letting the form fail on submit.
  if (!user.profile) redirect(withNext("/onboarding/education", destination));

  return (
    <div>
      <Stepper current="academic" />

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Step 2 of 2
        </p>
        <h1 className="mt-1.5 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Academic information
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          Last one — this is what we use to time your placement prep and curriculum.
        </p>

        <div className="mt-6">
          <AcademicForm
            next={destination}
            defaults={{
              studyStatus: user.profile.studyStatus ?? "studying",
              currentYear: user.profile.currentYear ? String(user.profile.currentYear) : "",
              graduationYear: user.profile.graduationYear
                ? String(user.profile.graduationYear)
                : "",
            }}
          />
        </div>
      </div>
    </div>
  );
}
