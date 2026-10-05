import { NextRequest } from "next/server";
import { registerSchema } from "@/lib/validation";
import { createAccount } from "@/lib/accounts";
import { ok, fail, handleError } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { destinationFor } from "@/lib/auth-routing";
import { sendVerification } from "@/lib/email-verification";
import { recordSignup } from "@/lib/referrals/service";

/**
 * Programmatic sign-up. The browser uses `signupAction`; this exists for API
 * clients and for the seed/test tooling, and must behave identically — same
 * unverified starting state, same verification email, same next step.
 */
export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());

    // `createAccount` takes the account fields only; the code is ours to act on.
    const { ref, ...account } = body;
    const result = await createAccount(account);
    if (!result.ok) return fail("An account with that email already exists", 409);

    const user = result.user;
    await startSession({ sub: user._id.toString(), email: user.email, role: user.role });

    /**
     * Attribute the referral, exactly as `signupAction` does.
     *
     * This route exists to behave identically to the browser path, and a
     * referral that only worked through the form would be a silent difference
     * between the two — the kind that is found months later by a student asking
     * where their reward went.
     */
    if (ref) await recordSignup(user._id.toString(), ref);

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
