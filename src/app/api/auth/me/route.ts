import { connectDB } from "@/lib/db";
import { User, needsEmailVerification } from "@/models/User";
import { getStudentProfile } from "@/lib/student-profile";
import { ok, fail, handleError, requireAuth } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireAuth();
    await connectDB();
    const user = await User.findById(session.sub);
    if (!user) return fail("User not found", 404);

    // Returned alongside the user because every client asking "who am I" is
    // really asking "and what is this account allowed to do next".
    const profile = await getStudentProfile(session.sub);

    return ok({
      user: user.toJSON(),
      studentProfile: profile,
      needsEmailVerification: needsEmailVerification(user),
      profileCompleted: profile?.profileCompleted === true,
    });
  } catch (err) {
    return handleError(err);
  }
}
