import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, type Feature } from "@/components/auth/auth-shell";
import { StudyingTogetherIllustration } from "@/components/auth/illustrations";
import { LoginForm } from "@/components/auth/login-form";
import { CubeIcon, SendIcon, UsersIcon } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Log in · EduPilot",
  description: "Log in to continue your learning and career journey with EduPilot.",
};

const FEATURES: Feature[] = [
  {
    icon: <CubeIcon />,
    title: "Learn",
    description: "Access courses and resources",
    tone: "indigo",
  },
  {
    icon: <SendIcon />,
    title: "Grow",
    description: "Build skills for your future",
    tone: "blue",
  },
  {
    icon: <UsersIcon />,
    title: "Connect",
    description: "Network with peers and mentors",
    tone: "emerald",
  },
];

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const destination = safeDestination(next);

  // Already signed in — no reason to show the form again.
  if (await getSession()) redirect(destination);

  return (
    <AuthShell
      heading={<>Welcome back! 👋</>}
      subheading="Log in to continue your learning and career journey"
      features={FEATURES}
      illustration={<StudyingTogetherIllustration className="w-full" />}
      formHeading="Login"
      formSubheading="Glad to see you again!"
      mobileIntro={
        <div className="text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back! 👋
          </h1>
          <p className="mx-auto mt-2 max-w-[260px] text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
            Log in to continue your learning and career journey
          </p>
        </div>
      }
    >
      <LoginForm next={next === undefined ? undefined : destination} />
    </AuthShell>
  );
}
