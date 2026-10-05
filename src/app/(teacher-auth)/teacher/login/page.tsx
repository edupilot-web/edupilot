import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { StudyingTogetherIllustration } from "@/components/auth/illustrations";
import { TEACHER_FEATURES } from "@/components/auth/panel-features";
import { TeacherLoginForm } from "@/components/teacher/teacher-auth-forms";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Teacher sign in · EduPilot",
  description: "Sign in to EduPilot to set work for your classes.",
};

/**
 * Outside the teacher shell, in its own route group, so the layout that gates
 * on the teacher role does not apply here — a teacher signing in does not have
 * a session yet, and a gate on this page would be a redirect loop.
 *
 * The chrome is the same `AuthShell` as `/login` and `/signup`. This page used
 * to draw its own — a light-only card on a grey page — which was where every
 * teacher screen visibly stopped looking like the rest of the product. The page
 * stays because everything that gates on the teacher role redirects here,
 * including `proxy.ts`, which runs before the database is reachable and so
 * cannot tell a teacher's URL from a student's any other way.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await getCurrentTeacher();
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  // Already signed in as a teacher: there is nothing to do here.
  if (teacher) redirect(safeDestination(next, "/teacher/dashboard"));

  return (
    <AuthShell
      heading={<>Welcome back! 👋</>}
      subheading="Set work for a whole cohort without maintaining a list of who is in it"
      features={TEACHER_FEATURES}
      illustration={<StudyingTogetherIllustration className="w-full" />}
      formHeading="Teacher sign in"
      formSubheading="Same account, same password as everywhere else."
      backHref="/"
      mobileIntro={
        <div className="text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back! 👋
          </h1>
          <p className="mx-auto mt-2 max-w-[260px] text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
            Sign in to set work for your classes
          </p>
        </div>
      }
    >
      <TeacherLoginForm next={next ? safeDestination(next, "") || undefined : undefined} />
    </AuthShell>
  );
}
