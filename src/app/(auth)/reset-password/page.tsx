import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, type Feature } from "@/components/auth/auth-shell";
import { StudyingTogetherIllustration } from "@/components/auth/illustrations";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { LockIcon, MailIcon, CheckCircleIcon } from "@/components/icons";
import { checkResetToken } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "Set a new password · EduPilot",
  /** Reset links must never be indexed or summarised by a crawler. */
  robots: { index: false, follow: false },
};

const FEATURES: Feature[] = [
  {
    icon: <LockIcon />,
    title: "New password",
    description: "At least 8 characters",
    tone: "indigo",
  },
  {
    icon: <CheckCircleIcon />,
    title: "Signs you out",
    description: "On every device, including any you do not recognise",
    tone: "blue",
  },
  {
    icon: <MailIcon />,
    title: "Works once",
    description: "The link cannot be reused",
    tone: "emerald",
  },
];

/**
 * Setting the new password.
 *
 * The token is checked **before** the form renders. A student following a link
 * that has expired, been used, or was superseded by a newer request is told so
 * immediately rather than choosing a password, typing it twice, and being
 * refused — which reads as the reset being broken rather than the link being
 * stale.
 */
export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const params = await props.searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  const check = await checkResetToken(token);

  return (
    <AuthShell
      heading={<>Set a new password</>}
      subheading="Choose something you have not used here before."
      features={FEATURES}
      illustration={<StudyingTogetherIllustration className="w-full" />}
      formHeading={check.ok ? "New password" : "Link problem"}
      formSubheading={check.ok ? check.email : "This link cannot be used"}
      backHref="/login"
      mobileIntro={
        <div className="text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Set a new password
          </h1>
        </div>
      }
    >
      {check.ok ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-[14px] font-semibold text-amber-900 dark:text-amber-200">
              {HEADINGS[check.reason]}
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-amber-800 dark:text-amber-300">
              {EXPLANATIONS[check.reason]}
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-[14px] font-semibold text-white transition hover:bg-blue-700"
          >
            Send a new link
          </Link>

          <p className="text-center text-[13px] text-slate-500 dark:text-slate-400">
            <Link
              href="/login"
              className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      )}
    </AuthShell>
  );
}

/**
 * Each reason gets its own words.
 *
 * "Used" in particular is worth separating from "invalid": somebody who has just
 * reset their password in another tab and clicked the link again needs to know
 * it worked, not that something is broken.
 */
const HEADINGS: Record<string, string> = {
  invalid: "This link is not valid",
  expired: "This link has expired",
  used: "This link has already been used",
  "email-changed": "This link is out of date",
};

const EXPLANATIONS: Record<string, string> = {
  invalid:
    "It may have been mistyped, or cut short by your email client. Send yourself a fresh one.",
  expired: "Reset links last an hour. Send yourself a new one and use it straight away.",
  used: "Your password has already been changed. If that was you, sign in with the new one.",
  "email-changed":
    "The address on this account has changed since the link was sent, so it no longer applies.",
};
