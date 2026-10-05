import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { StudyingTogetherIllustration } from "@/components/auth/illustrations";
import { LoginForm } from "@/components/auth/login-form";
import { SIGN_IN_FEATURES } from "@/components/auth/panel-features";
import { authErrorMessage } from "@/lib/auth-errors";
import { getCurrentUser } from "@/lib/current-user";
import { destinationFor } from "@/lib/auth-routing";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Log in · EduPilot",
  description: "Sign in to EduPilot — one account for students and teachers.",
};


export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error, reset } = await props.searchParams;
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
      subheading="Pick up your semester where you left it"
      features={SIGN_IN_FEATURES}
      illustration={<StudyingTogetherIllustration className="w-full" />}
      formHeading="Login"
      /**
       * One form for both roles.
       *
       * A teacher signing in here is sent to their own dashboard by
       * `destinationFor` — the role decides the destination, so there is nothing
       * for the visitor to choose and no second sign-in page to find.
       */
      formSubheading="Students and teachers, same sign-in."
      mobileIntro={
        <div className="text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back! 👋
          </h1>
          <p className="mx-auto mt-2 max-w-[260px] text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
            Pick up your semester where you left it
          </p>
        </div>
      }
    >
      <LoginForm
        next={next === undefined ? undefined : destination}
        /**
         * `?reset=1` is where a completed password reset lands.
         *
         * Confirming it here rather than on the reset screen is deliberate: the
         * reset signs every session out, so the student arrives at a sign-in
         * form they did not ask for, and without a word it looks as though the
         * reset failed.
         */
        notice={
          reset === "1"
            ? "Your password has been changed. Sign in with the new one."
            : authErrorMessage(error)
        }
      />
    </AuthShell>
  );
}
