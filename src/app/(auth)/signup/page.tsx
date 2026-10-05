import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { BuildingFutureIllustration } from "@/components/auth/illustrations";
import { SignupForm } from "@/components/auth/signup-form";
import { SignupRoleSwitch } from "@/components/auth/signup-role-switch";
import { STUDENT_FEATURES, TEACHER_FEATURES } from "@/components/auth/panel-features";
import { TeacherSignupForm, type ResolvedInvite } from "@/components/teacher/teacher-auth-forms";
import { connectDB } from "@/lib/db";
import { TeacherInvite } from "@/models/TeacherInvite";
import { createHash } from "node:crypto";
import { isWellFormedCode, normaliseCode } from "@/lib/referrals/fields";
import { authErrorMessage } from "@/lib/auth-errors";
import { getCurrentUser } from "@/lib/current-user";
import { destinationFor } from "@/lib/auth-routing";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Create your account · EduPilot",
  description:
    "Create a student or teacher account. Your syllabus, an AI tutor that answers from it, and the work your teachers set.",
};


export default async function SignupPage(props: PageProps<"/signup">) {
  const { next, error, ref, role, invite } = await props.searchParams;

  /**
   * Student or teacher, on one page.
   *
   * There were two, and a teacher who followed the landing page's obvious link
   * landed on the student form with no way across. The forms stay separate — a
   * teacher needs a college and has to clear that college's policy — but they
   * are reached from one place.
   */
  const asTeacher = role === "teacher";

  /**
   * An invitation, resolved **here** rather than in the browser.
   *
   * Server-side so the address and college it fixes are never the client's to
   * choose, and so a stale or revoked link says so before anything is typed.
   */
  const resolvedInvite = asTeacher && typeof invite === "string" ? await resolveInvite(invite) : null;

  /**
   * `?ref=` from an invite link.
   *
   * Validated for shape only, not looked up. A code that turns out to belong to
   * nobody is dropped silently when the account is created — checking here
   * would either slow the page down or, worse, let somebody probe which codes
   * exist by watching whether the banner appears.
   */
  const referralCode =
    typeof ref === "string" && isWellFormedCode(ref) ? normaliseCode(ref) : undefined;
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
        asTeacher ? (
          <>
            Teach with
            <br />
            EduPilot
          </>
        ) : (
          <>
            Create your
            <br />
            account
          </>
        )
      }
      subheading={
        asTeacher
          ? "Set work for a whole cohort without maintaining a list of who is in it"
          : "Your syllabus, an AI tutor that answers from it, and the work your teachers set"
      }
      features={asTeacher ? TEACHER_FEATURES : STUDENT_FEATURES}
      illustration={<BuildingFutureIllustration className="w-full" />}
      formHeading={asTeacher ? "Create a teacher account" : "Sign up"}
      formSubheading={
        asTeacher ? "Your college approves it before you can publish." : "Let's get you started!"
      }
      backHref="/login"
    >
      <SignupRoleSwitch
        role={asTeacher ? "teacher" : "student"}
        next={typeof next === "string" ? next : undefined}
      />

      {asTeacher ? (
        <>
          {typeof invite === "string" && !resolvedInvite && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              That invitation link is no longer valid — it may have expired, been used, or been
              withdrawn. You can still sign up if your college allows it, or ask for a new link.
            </p>
          )}
          {resolvedInvite && (
            /* Somebody following an invitation should see whose it is and where
               it is for, before they start filling anything in. */
            <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              You have been invited to teach at{" "}
              <strong className="font-semibold">{resolvedInvite.collegeName}</strong>. Your email and
              college are set by the invitation.
            </p>
          )}

          <TeacherSignupForm invite={resolvedInvite} />
        </>
      ) : (
        <SignupForm
          next={next === undefined ? undefined : destination}
          notice={authErrorMessage(error)}
          referralCode={referralCode}
        />
      )}
    </AuthShell>
  );
}

/**
 * Look up an invitation by its raw token.
 *
 * Read-only: it does not spend the invitation, which happens only once an
 * account has actually been created. A link opened and abandoned stays usable.
 *
 * Returns null for anything unusable — unknown, expired, spent or withdrawn —
 * and the page says so rather than rendering a form that will be refused.
 */
async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  if (token.length < 32) return null;

  try {
    await connectDB();
    const row = await TeacherInvite.findOne({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!row) return null;

    return {
      token,
      email: row.email,
      collegeId: String(row.collegeId),
      collegeName: row.collegeName ?? "your college",
      designation: row.designation ?? null,
    };
  } catch (err) {
    // A database that cannot be reached must not break the sign-up page; the
    // visitor falls through to the ordinary form and the server re-checks.
    console.error("[signup] could not resolve the invitation:", err);
    return null;
  }
}
