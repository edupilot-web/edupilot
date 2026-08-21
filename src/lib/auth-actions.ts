"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loginFormSchema, signupFormSchema } from "@/lib/validation";
import { authenticate, createAccount, type UserDocument } from "@/lib/accounts";
import { clearSessionCookie, startSession } from "@/lib/auth";
import { destinationFor, VERIFY_EMAIL_PATH, withNext } from "@/lib/auth-routing";
import { sendVerification } from "@/lib/email-verification";
import { isProfileCompleted } from "@/lib/student-profile";
import { needsEmailVerification } from "@/models/User";

/**
 * What the sign-in and sign-up forms render. `errors` is keyed by field name so
 * each input can show its own message; `message` is the form-level banner used
 * for failures that belong to no single field.
 */
export type AuthFormState = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const GENERIC_FAILURE = "Something went wrong on our end. Please try again.";

/** FormData values are `File | string | null`; forms only ever send us strings. */
function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, field: string): boolean {
  // An unchecked box sends nothing at all; a checked one sends "on".
  return formData.get(field) === "on";
}

export async function loginAction(
  _prevState: AuthFormState | undefined,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginFormSchema.safeParse({
    email: text(formData, "email"),
    password: text(formData, "password"),
    remember: checked(formData, "remember"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  let destination: string;

  // redirect() throws to unwind, so it has to happen after this block.
  try {
    const result = await authenticate({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (!result.ok) {
      // Deliberately vague: never confirm whether the email has an account.
      return { message: "Invalid email or password." };
    }

    const user = result.user;
    await startSession(
      { sub: user._id.toString(), email: user.email, role: user.role },
      { remember: parsed.data.remember }
    );

    destination = await destinationForAccount(user, text(formData, "next"));
  } catch (err) {
    console.error("[auth] login failed:", err);
    return { message: GENERIC_FAILURE };
  }

  redirect(destination);
}

export async function signupAction(
  _prevState: AuthFormState | undefined,
  formData: FormData
): Promise<AuthFormState> {
  const password = text(formData, "password");
  const confirmPassword = text(formData, "confirmPassword");

  const parsed = signupFormSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    password,
    confirmPassword,
    terms: checked(formData, "terms"),
  });

  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    // zod skips the schema's cross-field refine when any single field is
    // invalid, so a weak password plus unchecked terms would hide a mismatched
    // confirmation until the second submit. Surface it in the same pass.
    if (!errors.confirmPassword && confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = ["Passwords do not match"];
    }
    return { errors };
  }

  const next = text(formData, "next");

  try {
    const result = await createAccount({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (!result.ok) {
      return { errors: { email: ["An account with that email already exists."] } };
    }

    const user = result.user;
    // New accounts start a persistent session — there is no "remember me" on
    // sign-up, and being logged out on browser close would be a poor welcome.
    // The session is what lets the next screen offer "resend" and "change
    // email" without asking someone to sign in with an unconfirmed account.
    await startSession(
      { sub: user._id.toString(), email: user.email, role: user.role },
      { remember: true }
    );

    // Not rate-limited: this is the first send, and spending the user's
    // allowance before they have asked for anything would be perverse. A
    // failure is not fatal — the account exists and unverified is a valid
    // state, so the next screen offers to send it again.
    await sendVerification(
      { id: user._id.toString(), email: user.email, name: user.name, emailVerified: false },
      { enforceRateLimit: false }
    );
  } catch (err) {
    console.error("[auth] sign-up failed:", err);
    return { message: GENERIC_FAILURE };
  }

  // Straight to "check your email". Any `next` is parked in the URL and picked
  // up again once the address is confirmed.
  redirect(withNext(VERIFY_EMAIL_PATH, next));
}

/** Clears the session cookie and returns the user to the sign-in screen. */
export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

/**
 * Where an account that has just proved who it is should land.
 *
 * The two checks it needs — verified address, finished onboarding — are read
 * here and handed to the one routing function the whole app shares, so a
 * sign-in can never disagree with the gate on the page it sends the user to.
 */
async function destinationForAccount(user: UserDocument, next: string): Promise<string> {
  const unverified = needsEmailVerification(user);
  return destinationFor(
    {
      needsEmailVerification: unverified,
      // Skipped while unverified: the answer cannot change the destination, and
      // there is no reason to query for it.
      profileCompleted: unverified ? false : await isProfileCompleted(user._id.toString()),
    },
    next
  );
}
