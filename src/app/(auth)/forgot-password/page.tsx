import type { Metadata } from "next";
import { AuthShell, type Feature } from "@/components/auth/auth-shell";
import { StudyingTogetherIllustration } from "@/components/auth/illustrations";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LockIcon, MailIcon, CheckCircleIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Forgot password · EduPilot",
  description: "Send yourself a link to set a new EduPilot password.",
};

const FEATURES: Feature[] = [
  {
    icon: <MailIcon />,
    title: "One link",
    description: "Sent to the address you signed up with",
    tone: "blue",
  },
  {
    icon: <LockIcon />,
    title: "Works once",
    description: "And expires an hour after it is sent",
    tone: "indigo",
  },
  {
    icon: <CheckCircleIcon />,
    title: "Signs you out",
    description: "Everywhere, on every device",
    tone: "emerald",
  },
];

/**
 * Asking for a reset link.
 *
 * Deliberately **not** gated on being signed out. Somebody who is signed in on
 * one device and suspects another is not theirs should be able to reach this
 * without signing out first — and resetting is precisely what removes the other
 * session.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      heading={<>Forgot your password?</>}
      subheading="It happens. Send yourself a link and pick a new one."
      features={FEATURES}
      illustration={<StudyingTogetherIllustration className="w-full" />}
      formHeading="Reset password"
      formSubheading="We will email you a link"
      backHref="/login"
      mobileIntro={
        <div className="text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Forgot your password?
          </h1>
          <p className="mx-auto mt-2 max-w-[260px] text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
            Send yourself a link and pick a new one
          </p>
        </div>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
