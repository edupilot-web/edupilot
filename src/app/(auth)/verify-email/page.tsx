import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CenteredCard } from "@/components/auth/centered-card";
import { VerificationResult } from "@/components/auth/verification-result";
import { VerifyEmailPanel } from "@/components/auth/verify-email-panel";
import { destinationFor, withNext } from "@/lib/auth-routing";
import { getCurrentUser } from "@/lib/current-user";
import { verifyEmailToken } from "@/lib/email-verification";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = { title: "Verify your email · EduPilot" };

/**
 * The address-confirmation screen, in both of its jobs.
 *
 * With `?token=` it is the endpoint the emailed link points at: it validates
 * the token, flips the flag and hands the user on. Without one it is the
 * "check your inbox" screen the sign-up flow lands on.
 *
 * Keeping them on one route is what makes the loop impossible — there is no
 * second page that could disagree about whether the address is confirmed, and
 * a verified user who lands here is bounced onward by the same
 * `destinationFor` every other gate uses.
 */
export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const { token, next } = await props.searchParams;
  const destination = typeof next === "string" ? safeDestination(next, "") : "";
  const rawToken = typeof token === "string" ? token : null;

  // Read before consuming the token: whether a session exists decides where a
  // successful verification can send the user.
  const viewer = await getCurrentUser();

  if (rawToken) {
    const outcome = await verifyEmailToken(rawToken);

    if (outcome.status === "verified" || outcome.status === "already-verified") {
      // Same person, same browser: carry straight on into the product. A link
      // opened on a phone while signed in elsewhere lands on the confirmation
      // below instead, because this session is not the one that was waiting.
      if (viewer && viewer.id === outcome.userId) {
        redirect(
          destinationFor(
            { needsEmailVerification: false, profileCompleted: viewer.profileCompleted },
            destination
          )
        );
      }

      return (
        <CenteredCard>
          <VerificationResult
            tone="success"
            title="Email verified 🎉"
            description="Your email address is confirmed. Sign in to finish setting up your student profile."
            primary={{ href: withNext("/login", destination), label: "Continue to sign in" }}
          />
        </CenteredCard>
      );
    }

    if (outcome.status === "expired") {
      return (
        <CenteredCard>
          <VerificationResult
            tone="expired"
            title="Your verification link has expired"
            description="Links are short-lived for your security. Request a new one and we'll send it straight away."
            primary={
              viewer
                ? undefined
                : { href: withNext("/login", destination), label: "Sign in to get a new link" }
            }
            secondary={
              viewer ? (
                <ResendPanel next={destination} />
              ) : (
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  New here?{" "}
                  <Link
                    href="/signup"
                    className="font-semibold text-blue-600 transition hover:underline dark:text-blue-400"
                  >
                    Create an account
                  </Link>
                </p>
              )
            }
          />
        </CenteredCard>
      );
    }

    // Invalid: never used, already spent, or made up. The same words for all
    // three — anything more precise tells whoever is holding the link something
    // about the account behind it.
    return (
      <CenteredCard>
        <VerificationResult
          tone="invalid"
          title="This link is no longer valid"
          description="This verification link is invalid or has already been used. If your email is already verified, just sign in."
          primary={{ href: withNext("/login", destination), label: "Go to sign in" }}
          secondary={
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Need a new link? Sign in and we&apos;ll offer to send one.
            </p>
          }
        />
      </CenteredCard>
    );
  }

  // No token — this is the "check your inbox" screen, which needs to know whose
  // inbox it is talking about.
  if (!viewer) redirect(withNext("/login", destination));

  if (!viewer.needsEmailVerification) {
    redirect(
      destinationFor(
        { needsEmailVerification: false, profileCompleted: viewer.profileCompleted },
        destination
      )
    );
  }

  return (
    <CenteredCard>
      <VerifyEmailPanel email={viewer.email} next={destination || undefined} />
    </CenteredCard>
  );
}

/** Shown under the "expired" message when we know who is asking. */
function ResendPanel({ next }: { next: string }) {
  return (
    <Link
      href={withNext("/verify-email", next)}
      className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      Send a new verification email
    </Link>
  );
}
