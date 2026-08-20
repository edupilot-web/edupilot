import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { Stepper } from "@/components/onboarding/stepper";
import { getCurrentUser } from "@/lib/current-user";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = { title: "Complete your profile · EduPilot" };

export default async function ProfileStepPage(props: PageProps<"/onboarding/profile">) {
  const user = await getCurrentUser();
  // The layout gates this too; repeated so the page never renders without a user.
  if (!user) redirect("/login");

  const { next } = await props.searchParams;
  const destination = next === undefined ? undefined : safeDestination(next);

  return (
    <div>
      <Stepper current="profile" />

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Complete your profile
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          Two quick steps and you are in. This is what your peers and mentors will see.
        </p>

        <div className="mt-6">
          <ProfileForm
            email={user.email}
            next={destination}
            defaults={{
              name: user.name,
              phone: user.phone ?? "",
              city: user.city ?? "",
            }}
          />
        </div>
      </div>
    </div>
  );
}
