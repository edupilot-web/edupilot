"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth";
import { consumeReset, requestReset } from "@/lib/password-reset";
import { formatRetryAfter } from "@/lib/rate-limit";

/**
 * The two steps of a password reset, as server actions.
 *
 * Server actions rather than API routes because both are plain form posts from
 * pages that have no other client behaviour — the same reasoning the sign-in and
 * sign-up forms already follow.
 */

export type ResetFormState = {
  error?: string;
  /** Set once the request has been accepted, whatever it actually did. */
  sent?: boolean;
};

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export async function requestResetAction(
  _previous: ResetFormState,
  formData: FormData
): Promise<ResetFormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));

  if (!parsed.success) {
    return { error: "Enter a valid email address" };
  }

  const result = await requestReset(parsed.data);

  if (!result.ok) {
    /**
     * Even the rate limit is worded without confirming anything.
     *
     * "Too many requests **for this address**" would still be an oracle: it only
     * fires for addresses somebody is hammering, but a careful attacker learns
     * from the difference between this and the neutral success. The message
     * describes the action, not the account.
     */
    return {
      error: `Too many reset requests. Try again in ${formatRetryAfter(result.retryAfterSeconds)}.`,
    };
  }

  /**
   * The same answer whether or not the address has an account.
   *
   * Anything else turns this form into a way to ask "does this person have an
   * account here?" about any address in the world — which is a list worth having
   * if you are writing a phishing mail.
   */
  return { sent: true };
}

const resetSchema = z
  .object({
    token: z.string().min(32),
    password: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  });

export async function resetPasswordAction(
  _previous: ResetFormState,
  formData: FormData
): Promise<ResetFormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again" };
  }

  const result = await consumeReset(parsed.data.token, parsed.data.password);

  if (!result.ok) {
    return { error: MESSAGES[result.reason] };
  }

  /**
   * Drop the cookie before leaving.
   *
   * The reset has already moved `sessionsValidFrom`, so any session this browser
   * holds is dead — but the cookie would still be sent on the next request and
   * every gate would spend a query rejecting it. Clearing it makes the sign-in
   * screen behave like a signed-out one, which is what it now is.
   */
  await clearSessionCookie();

  redirect("/login?reset=1");
}

const MESSAGES: Record<string, string> = {
  invalid: "That reset link is not valid. Ask for a new one.",
  expired: "That reset link has expired. Ask for a new one.",
  used: "That reset link has already been used. Ask for a new one if you still need it.",
  "email-changed": "That link was sent to a different address. Ask for a new one.",
  weak: "Use at least 8 characters.",
};
