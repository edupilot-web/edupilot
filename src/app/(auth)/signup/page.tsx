import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, type Feature } from "@/components/auth/auth-shell";
import { BuildingFutureIllustration } from "@/components/auth/illustrations";
import { SignupForm } from "@/components/auth/signup-form";
import { LayoutIcon, TrendingUpIcon, UsersIcon } from "@/components/icons";
import { authErrorMessage } from "@/lib/auth-errors";
import { getCurrentUser } from "@/lib/current-user";
import { destinationFor } from "@/lib/auth-routing";
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

  /**
   * Already signed in — send them where they belong.
   *
   * `getCurrentUser` rather than `getSession`: a token can verify perfectly for
   * an account that no longer exists (a deleted user, a restored database), and
   * redirecting on the token alone loops forever against the app shell, which
   * bounces back here the moment it cannot load that user. Requiring the user to
   * actually exist is what breaks that cycle — a stale cookie now falls through
   * to the form and is replaced by the next sign-in.
   *
   * `destinationFor` rather than the raw `?next=`: it is the one function every
   * other gate asks, so an unverified or half-onboarded account is sent straight
   * to the right step instead of bouncing off the dashboard on the way.
   */
  const signedIn = await getCurrentUser();
  // `next` arrives from a query string and may be repeated, so only a single
  // string is honoured; `destinationFor` sanitises it either way.
  if (signedIn) redirect(destinationFor(signedIn, typeof next === "string" ? next : null));

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
