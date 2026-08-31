import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, type Feature } from "@/components/auth/auth-shell";
import { StudyingTogetherIllustration } from "@/components/auth/illustrations";
import { LoginForm } from "@/components/auth/login-form";
import { CubeIcon, SendIcon, UsersIcon } from "@/components/icons";
import { authErrorMessage } from "@/lib/auth-errors";
import { getCurrentUser } from "@/lib/current-user";
import { destinationFor } from "@/lib/auth-routing";
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
      <LoginForm
        next={next === undefined ? undefined : destination}
        notice={authErrorMessage(error)}
      />
    </AuthShell>
  );
}
