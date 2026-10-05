import { fail, handleError, ok } from "@/lib/api";
import { policyFor } from "@/lib/teaching/invites";
import { TEACHER_SIGNUP_MODE_BLURBS } from "@/lib/teaching/fields";

/**
 * GET /api/teacher/signup/policy?collegeId=… — what this college requires.
 *
 * Public, because the sign-up form has to ask it before anyone has an account.
 * What it returns is deliberately thin: the mode, the allowed domains and a
 * sentence to show. Nothing about who has been invited, and no way to ask
 * whether a given address would be accepted — that would make this an oracle
 * for which staff addresses exist at an institution.
 *
 * The form uses it to say what is needed *before* somebody fills in six fields
 * and is refused. `checkEligibility` re-decides on submit regardless; this
 * endpoint only changes what the screen says.
 */
export async function GET(req: Request) {
  try {
    const collegeId = new URL(req.url).searchParams.get("collegeId");
    if (!collegeId) return fail("Choose a college", 400);

    const policy = await policyFor(collegeId);
    if (!policy) return fail("That college does not exist", 404);

    return ok({
      collegeName: policy.collegeName,
      mode: policy.mode,
      /** Shown so a teacher knows which address to use, not to be matched client-side. */
      allowedDomains: policy.mode === "domain" ? policy.allowedDomains : [],
      blurb: TEACHER_SIGNUP_MODE_BLURBS[policy.mode],
      /** Whether self-registration is possible here at all, without an invitation. */
      selfServe: policy.mode === "open" || (policy.mode === "domain" && policy.allowedDomains.length > 0),
    });
  } catch (err) {
    return handleError(err);
  }
}
