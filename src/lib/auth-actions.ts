"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loginFormSchema, signupFormSchema } from "@/lib/validation";
import { authenticate, createAccount } from "@/lib/accounts";
import { clearSessionCookie, startSession } from "@/lib/auth";
import { safeDestination } from "@/lib/redirects";

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
  } catch (err) {
    console.error("[auth] login failed:", err);
    return { message: GENERIC_FAILURE };
  }

  redirect(safeDestination(text(formData, "next")));
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
    await startSession(
      { sub: user._id.toString(), email: user.email, role: user.role },
      { remember: true }
    );
  } catch (err) {
    console.error("[auth] sign-up failed:", err);
    return { message: GENERIC_FAILURE };
  }

  redirect(safeDestination(text(formData, "next")));
}

/** Clears the session cookie and returns the user to the sign-in screen. */
export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
