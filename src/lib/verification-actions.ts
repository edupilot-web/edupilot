"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { changeUnverifiedEmail } from "@/lib/accounts";
import { startSession } from "@/lib/auth";
import { destinationFor, VERIFY_EMAIL_PATH, withNext } from "@/lib/auth-routing";
import { getCurrentUser } from "@/lib/current-user";
import { MAX_CODE_ATTEMPTS, sendVerification, verifyEmailCode } from "@/lib/email-verification";
import { formatRetryAfter } from "@/lib/rate-limit";
import { changeEmailSchema, verificationCodeSchema } from "@/lib/validation";

/**
 * What the check-your-inbox screen renders. `status` drives the tone of the
 * banner — the same screen reports a successful resend and a refused one.
 *
 * `clearCode` asks the OTP boxes to empty themselves: a wrong code should leave
 * the student typing a new one, not editing the old one digit by digit.
 */
export type VerificationFormState = {
  status?: "sent" | "error" | "info";
  message?: string;
  errors?: Record<string, string[] | undefined>;
  clearCode?: boolean;
};

const GENERIC_FAILURE = "Something went wrong on our end. Please try again.";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Sends a fresh verification link.
 *
 * Rate limited server-side (see `email-verification.ts`) — the button being
 * disabled in the browser is a courtesy, not a control, and the endpoint has to
 * assume nobody is using the button at all.
 *
 * Takes no arguments: there is nothing to submit, and `useActionState` accepts
 * an action that ignores the state and form data it would otherwise be handed.
 */
export async function resendVerificationAction(): Promise<VerificationFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.needsEmailVerification) {
    return { status: "info", message: "Your email address is already verified." };
  }

  try {
    const outcome = await sendVerification({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    });

    switch (outcome.status) {
      case "sent":
        return {
          status: "sent",
          message: `We've sent a new verification link to ${user.email}.`,
        };
      case "already-verified":
        return { status: "info", message: "Your email address is already verified." };
      case "rate-limited":
        return {
          status: "error",
          message: `You've asked for several links already. Please try again ${formatRetryAfter(
            outcome.retryAfterSeconds
          )}.`,
        };
      default:
        return {
          status: "error",
          message: "We could not send that email just now. Please try again in a moment.",
        };
    }
  } catch (err) {
    console.error("[auth] could not resend the verification email:", err);
    return { status: "error", message: GENERIC_FAILURE };
  }
}

/**
 * Corrects a mistyped address and mails the link to the new one.
 *
 * Only reachable while the account is unverified, which is what stops it being
 * an account-takeover primitive: there is nothing of value behind an address
 * nobody has confirmed.
 */
export async function changeEmailAction(
  _prevState: VerificationFormState | undefined,
  formData: FormData
): Promise<VerificationFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.needsEmailVerification) {
    return { status: "info", message: "Your email address is already verified." };
  }

  const parsed = changeEmailSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  if (parsed.data.email === user.email) {
    return { errors: { email: ["That is already the address on your account."] } };
  }

  try {
    const result = await changeUnverifiedEmail(user.id, parsed.data.email);

    if (!result.ok) {
      if (result.reason === "email-taken") {
        return { errors: { email: ["An account with that email already exists."] } };
      }
      return { status: "error", message: GENERIC_FAILURE };
    }

    // Re-issue the session so its `email` claim matches the row. Nothing
    // authorizes on that claim — `sub` is the identity — but a cookie that
    // disagrees with the database is a trap for the next person to read one.
    await startSession(
      {
        sub: result.user._id.toString(),
        email: result.user.email,
        role: result.user.role,
      },
      { remember: true }
    );

    // Counts against the resend limits, and rightly so: this is the path that
    // could otherwise be used to mail a stranger's inbox on repeat.
    const outcome = await sendVerification({
      id: result.user._id.toString(),
      email: result.user.email,
      name: result.user.name,
      emailVerified: false,
    });

    if (outcome.status === "rate-limited") {
      return {
        status: "error",
        message: `Your address was updated, but we've sent a lot of links already. Ask for a new one ${formatRetryAfter(
          outcome.retryAfterSeconds
        )}.`,
      };
    }
    if (outcome.status === "send-failed") {
      return {
        status: "error",
        message:
          "Your address was updated, but we could not send the email. Try 'Resend email' in a moment.",
      };
    }

    return {
      status: "sent",
      message: `We've sent a verification link to ${result.user.email}.`,
    };
  } catch (err) {
    console.error("[auth] could not change the unverified email:", err);
    return { status: "error", message: GENERIC_FAILURE };
  }
}

/**
 * Checks the code the student typed and, when it holds up, moves them on.
 *
 * The redirect is deliberately outside the `try`: `redirect` works by throwing,
 * so calling it inside would have the catch below turn a successful
 * verification into "something went wrong on our end".
 *
 * Every refusal is phrased for someone who mistyped, because that is who almost
 * all of them are. Nothing here reveals whether a code exists for a different
 * account — there is no lookup by code at all, only against the signed-in user.
 */
export async function verifyCodeAction(
  _prevState: VerificationFormState | undefined,
  formData: FormData
): Promise<VerificationFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const next = text(formData, "next");

  if (!user.needsEmailVerification) {
    redirect(destinationFor(user, next));
  }

  const parsed = verificationCodeSchema.safeParse({ code: text(formData, "code") });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  let outcome: Awaited<ReturnType<typeof verifyEmailCode>>;
  try {
    outcome = await verifyEmailCode(user.id, parsed.data.code);
  } catch (err) {
    console.error("[auth] could not check the verification code:", err);
    return { status: "error", message: GENERIC_FAILURE };
  }

  switch (outcome.status) {
    case "verified":
    case "already-verified":
      // Past the gate. `destinationFor` decides where that leads — onboarding
      // for a new account, or wherever they were originally headed.
      break;

    case "incorrect":
      return {
        errors: {
          code: [
            outcome.attemptsRemaining === 1
              ? "That code is not correct. One more try before we cancel it."
              : `That code is not correct. ${outcome.attemptsRemaining} tries left.`,
          ],
        },
        clearCode: true,
      };

    case "too-many-attempts":
      return {
        status: "error",
        message: `That code was cancelled after ${MAX_CODE_ATTEMPTS} incorrect attempts. Send yourself a new one to continue.`,
        clearCode: true,
      };

    case "expired":
      return {
        status: "error",
        message: "That code has expired. Send yourself a new one and we'll email it straight away.",
        clearCode: true,
      };

    case "no-code":
      return {
        status: "error",
        message: "We don't have a code waiting for this account. Send yourself a new one.",
        clearCode: true,
      };

    case "rate-limited":
      return {
        status: "error",
        message: `Too many attempts. Please try again ${formatRetryAfter(outcome.retryAfterSeconds)}.`,
        clearCode: true,
      };
  }

  redirect(
    destinationFor(
      { needsEmailVerification: false, profileCompleted: user.profileCompleted, role: user.role },
      next
    )
  );
}

/** Re-reads the account and moves on if the link has since been followed. */
export async function continueAfterVerificationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const next = text(formData, "next");
  if (user.needsEmailVerification) {
    redirect(withNext(VERIFY_EMAIL_PATH, next));
  }

  redirect(destinationFor(user, next));
}
