import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, type Feature } from "@/components/auth/auth-shell";
import { BuildingFutureIllustration } from "@/components/auth/illustrations";
import { SignupForm } from "@/components/auth/signup-form";
import { LayoutIcon, TrendingUpIcon, UsersIcon } from "@/components/icons";
import { authErrorMessage } from "@/lib/auth-errors";
import { getSession } from "@/lib/auth";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Create your account · EduPilot",
  description: "Join thousands of students and graduates building their future with EduPilot.",
};

const FEATURES: Feature[] = [
  {
    icon: <LayoutIcon />,
    title: "Personalized learning",
    description: "Courses and recommendations tailored for you",
    tone: "blue",
  },
  {
    icon: <TrendingUpIcon />,
    title: "Career growth",
    description: "Find opportunities and build in-demand skills",
    tone: "amber",
  },
  {
    icon: <UsersIcon />,
    title: "Community support",
    description: "Connect, collaborate and grow together",
    tone: "emerald",
  },
];

export default async function SignupPage(props: PageProps<"/signup">) {
  const { next, error } = await props.searchParams;
  const destination = safeDestination(next);

  if (await getSession()) redirect(destination);

  return (
    <AuthShell
      heading={
        <>
          Create your
          <br />
          account
        </>
      }
      subheading="Join thousands of students and graduates building their future"
      features={FEATURES}
      illustration={<BuildingFutureIllustration className="w-full" />}
      formHeading="Sign up"
      formSubheading="Let's get you started!"
      backHref="/login"
    >
      <SignupForm
        next={next === undefined ? undefined : destination}
        notice={authErrorMessage(error)}
      />
    </AuthShell>
  );
}
