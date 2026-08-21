import { NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation";
import { authenticate } from "@/lib/accounts";
import { ok, fail, handleError } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { destinationFor } from "@/lib/auth-routing";
import { isProfileCompleted } from "@/lib/student-profile";
import { needsEmailVerification } from "@/models/User";

export async function POST(req: NextRequest) {
  try {
    const body = loginSchema.parse(await req.json());

    const result = await authenticate(body);
    // Same message either way so the endpoint does not confirm which emails exist.
    if (!result.ok) return fail("Invalid email or password", 401);

    const user = result.user;
    await startSession(
      { sub: user._id.toString(), email: user.email, role: user.role },
      { remember: body.remember }
    );

    // An unverified account still signs in — that is how it reaches the screen
    // offering a new link. `next` tells the client where it may actually go.
    const unverified = needsEmailVerification(user);

    return ok({
      user: user.toJSON(),
      next: destinationFor({
        needsEmailVerification: unverified,
        profileCompleted: unverified ? false : await isProfileCompleted(user._id.toString()),
      }),
    });
  } catch (err) {
    return handleError(err);
  }
}
