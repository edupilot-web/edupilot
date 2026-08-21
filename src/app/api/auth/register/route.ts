import { NextRequest } from "next/server";
import { registerSchema } from "@/lib/validation";
import { createAccount } from "@/lib/accounts";
import { ok, fail, handleError } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { destinationFor } from "@/lib/auth-routing";
import { sendVerification } from "@/lib/email-verification";

/**
 * Programmatic sign-up. The browser uses `signupAction`; this exists for API
 * clients and for the seed/test tooling, and must behave identically — same
 * unverified starting state, same verification email, same next step.
 */
export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());

    const result = await createAccount(body);
    if (!result.ok) return fail("An account with that email already exists", 409);

    const user = result.user;
    await startSession({ sub: user._id.toString(), email: user.email, role: user.role });

    // A delivery failure does not fail the request: the account exists and is
    // in a valid unverified state, and the client's recourse is to ask for
    // another link rather than to sign up again.
    const delivery = await sendVerification(
      { id: user._id.toString(), email: user.email, name: user.name, emailVerified: false },
      { enforceRateLimit: false }
    );

    return ok(
      {
        user: user.toJSON(),
        emailVerificationSent: delivery.status === "sent",
        next: destinationFor({ needsEmailVerification: true, profileCompleted: false }),
      },
      201
    );
  } catch (err) {
    return handleError(err);
  }
}
