import { NextRequest } from "next/server";
import { registerSchema } from "@/lib/validation";
import { createAccount } from "@/lib/accounts";
import { ok, fail, handleError } from "@/lib/api";
import { startSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());

    const result = await createAccount(body);
    if (!result.ok) return fail("An account with that email already exists", 409);

    const user = result.user;
    await startSession({ sub: user._id.toString(), email: user.email, role: user.role });

    return ok({ user: user.toJSON() }, 201);
  } catch (err) {
    return handleError(err);
  }
}
