import { NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation";
import { authenticate } from "@/lib/accounts";
import { ok, fail, handleError } from "@/lib/api";
import { startSession } from "@/lib/auth";

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

    return ok({ user: user.toJSON() });
  } catch (err) {
    return handleError(err);
  }
}
