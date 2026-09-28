import { authenticate } from "@/lib/accounts";
import { fail, handleError, ok } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";
import { teacherLoginSchema } from "@/lib/teaching/validation";
import { TeacherProfile } from "@/models/Teacher";

/**
 * POST /api/teacher/login  (§6)
 *
 * A separate endpoint from the student login, and the *same* authentication
 * behind it: `authenticate()` compares the same bcrypt hash and `startSession()`
 * mints the same signed cookie. §6 asks for a separate login UX, not a second
 * auth system — and a second one would be a second place to get password
 * comparison, timing and session expiry right.
 *
 * What this endpoint adds is a role check and a destination. A student
 * attempting to sign in here is refused with the same wording as a wrong
 * password, so neither endpoint becomes a way to discover which addresses are
 * teachers.
 */

/** Rate limited by address and by IP-less key, as the student login is not yet. */
const LOGIN_LIMITS = {
  perEmail: { limit: 10, windowSeconds: 15 * 60 },
};

export async function POST(req: Request) {
  try {
    const parsed = teacherLoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Enter your email address and password", 422);

    const input = parsed.data;

    const allowance = await consumeRateLimits([
      { key: `teacher-login:${input.email}`, rule: LOGIN_LIMITS.perEmail },
    ]);

    if (!allowance.allowed) {
      return fail(
        `Too many attempts. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429
      );
    }

    const result = await authenticate({ email: input.email, password: input.password });
    if (!result.ok) return fail("Invalid email or password", 401);

    const user = result.user;

    /**
     * Not a teacher: refused with the credential message, not with "this is
     * the wrong door".
     *
     * A distinct message would confirm that the address exists and is a
     * student's, which is exactly the enumeration the shared wording avoids.
     */
    if (user.role !== "teacher") return fail("Invalid email or password", 401);

    await connectDB();
    const profile = await TeacherProfile.findOne({ userId: user._id })
      .select("status collegeName")
      .lean();

    // A teacher account with no profile cannot be described by any screen.
    if (!profile) return fail("Invalid email or password", 401);

    await startSession(
      { sub: user._id.toString(), email: user.email, role: user.role },
      { remember: input.remember }
    );

    /**
     * Every status signs in, including `pending` and `suspended`.
     *
     * Signing in is how a pending teacher sees that they are pending, and how a
     * suspended one reads why. Blocking here would leave both staring at a
     * login form with no explanation — and neither can publish anything
     * regardless, because `requireTeacher` gates that on the status.
     */
    return ok({
      teacher: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        status: profile.status,
        collegeName: profile.collegeName,
      },
      next: user.emailVerified ? "/teacher/dashboard" : "/verify-email",
    });
  } catch (err) {
    return handleError(err);
  }
}
