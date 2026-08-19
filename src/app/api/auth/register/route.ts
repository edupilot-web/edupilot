import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { registerSchema } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/api";
import { signSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = registerSchema.parse(await req.json());

    const existing = await User.findOne({ email: body.email }).lean();
    if (existing) return fail("An account with that email already exists", 409);

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await User.create({
      name: body.name,
      email: body.email,
      passwordHash,
      role: body.role ?? "student",
    });

    const token = await signSession({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    await setSessionCookie(token);

    return ok({ user: user.toJSON() }, 201);
  } catch (err) {
    return handleError(err);
  }
}
