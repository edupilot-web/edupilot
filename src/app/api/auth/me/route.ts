import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { ok, fail, handleError, requireAuth } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireAuth();
    await connectDB();
    const user = await User.findById(session.sub);
    if (!user) return fail("User not found", 404);
    return ok({ user: user.toJSON() });
  } catch (err) {
    return handleError(err);
  }
}
