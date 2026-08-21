import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { safeDestination } from "@/lib/redirects";
import { withNext } from "@/lib/auth-routing";
import { STUDY_YEAR_LABELS } from "@/lib/user-fields";

export const metadata: Metadata = { title: "You're all set · EduPilot" };

/**
 * The full stop at the end of onboarding.
 *
 * It exists so finishing feels like finishing rather than like being dropped
 * somewhere, and it doubles as a last look at what was saved — the cheapest
 * moment to notice a wrong graduation year is before it starts driving
 * recommendations.
 */
export default async function OnboardingCompletePage(props: PageProps<"/onboarding/complete">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { next } = await props.searchParams;
  const destination = next === undefined ? undefined : safeDestination(next);

  // Nothing to celebrate yet — this page is reachable only once the profile is
  // actually complete.
  if (!user.profileCompleted || !user.profile) {
    redirect(withNext("/onboarding/education", destination));
  }

  const profile = user.profile;
  const firstName = user.name.trim().split(/\s+/)[0];

  const summary = [
    { label: "College", value: profile.collegeName },
    { label: "Degree", value: `${profile.degree} · ${profile.specialization}` },
    {
      label: profile.studyStatus === "graduated" ? "Graduated" : "Current year",
      value:
        profile.studyStatus === "graduated"
          ? String(profile.graduationYear)
          : `${STUDY_YEAR_LABELS[profile.currentYear ?? 0] ?? "—"} · graduating ${profile.graduationYear}`,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-[26px] dark:bg-emerald-500/10">
        🎉
      </span>

      <h1 className="mt-4 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
        You&apos;re all set{firstName ? `, ${firstName}` : ""}!
      </h1>
      <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        Your student profile is ready. You can add a photo, bio, skills and links any time from
        your profile page.
      </p>

      <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200/80 text-left dark:divide-slate-800 dark:border-slate-800">
        {summary.map((row) => (
          <div key={row.label} className="flex items-start gap-3 px-4 py-3">
            <dt className="w-[92px] shrink-0 text-[12.5px] font-medium text-slate-400 dark:text-slate-500">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 text-[13.5px] font-medium text-slate-800 dark:text-slate-100">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <Link
        href={destination || "/dashboard"}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-[15px] font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
      >
        Continue to EduPilot
      </Link>
    </div>
  );
}
