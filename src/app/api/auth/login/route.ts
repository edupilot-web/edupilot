import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { loginSchema } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/api";
import { signSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = loginSchema.parse(await req.json());

    const user = await User.findOne({ email: body.email }).select("+passwordHash");
    // Same message either way so the endpoint does not confirm which emails exist.
    if (!user) return fail("Invalid email or password", 401);

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) return fail("Invalid email or password", 401);

    const token = await signSession({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    await setSessionCookie(token);

    return ok({ user: user.toJSON() });
  } catch (err) {
    return handleError(err);
  }
}
