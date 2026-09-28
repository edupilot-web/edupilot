import { Types } from "mongoose";
import { createAccount } from "@/lib/accounts";
import { fail, handleError, ok } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { sendVerification } from "@/lib/email-verification";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";
import { teacherAutoApproveEnabled } from "@/lib/teaching/fields";
import { teacherSignupSchema } from "@/lib/teaching/validation";
import { Department } from "@/models/AcademicStructure";
import { College } from "@/models/College";
import { TeacherProfile } from "@/models/Teacher";

/**
 * POST /api/teacher/signup  (§3, §4, §5)
 *
 * Creates a teacher account and its profile, then mails a verification link.
 *
 * The role is set **here**, server-side. `registerSchema` accepts only
 * `student`, so there is no self-service path to this role — which matters
 * because a teacher account is the one a college's students can be published
 * to. What signing up actually grants is nothing: the profile lands in
 * `pending`, and what a teacher can reach is `TeacherAcademicAssignment`, which
 * only an administrator writes.
 *
 * The college is an **id from the directory**, never free text (§3). A typed
 * name would put two spellings of one institution in the system and leave the
 * audience resolver unable to match either against a student.
 */

/**
 * Per-address and per-college limits.
 *
 * The college limit is the one that matters: signing up is cheap and a teacher
 * account is a claim on a college's students, so a script creating three
 * hundred pending teachers against one institution would bury the approval
 * queue. Fifteen an hour is far above a real induction day.
 */
const SIGNUP_LIMITS = {
  perEmail: { limit: 5, windowSeconds: 60 * 60 },
  perCollege: { limit: 15, windowSeconds: 60 * 60 },
};

export async function POST(req: Request) {
  try {
    const parsed = teacherSignupSchema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check the form and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const input = parsed.data;

    const allowance = await consumeRateLimits([
      { key: `teacher-signup:email:${input.email}`, rule: SIGNUP_LIMITS.perEmail },
      { key: `teacher-signup:college:${input.collegeId}`, rule: SIGNUP_LIMITS.perCollege },
    ]);

    if (!allowance.allowed) {
      return fail(
        `Too many sign-ups. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429
      );
    }

    await connectDB();

    /**
     * The college must exist and still be in service.
     *
     * An archived or inactive institution is not one a teacher should be able
     * to attach themselves to: the students are not there, and the account
     * would sit pending against a college with nobody to approve it.
     */
    const college = await College.findOne({
      _id: input.collegeId,
      status: { $in: ["active", "suspended"] },
    })
      .select("name")
      .lean();

    if (!college) {
      return fail("Choose your college from the list", 422, { field: "collegeId" });
    }

    // A department, if given, must belong to that college — otherwise a teacher
    // could file themselves under another institution's department.
    let department: { _id: Types.ObjectId; name: string } | null = null;
    if (input.departmentId) {
      department = await Department.findOne({
        _id: input.departmentId,
        collegeId: college._id,
      })
        .select("name")
        .lean();

      if (!department) {
        return fail("Choose a department from your college", 422, { field: "departmentId" });
      }
    }

    const account = await createAccount({
      name: input.name,
      email: input.email,
      password: input.password,
      role: "teacher",
    });

    if (!account.ok) {
      // The same wording the student sign-up uses, so neither endpoint becomes
      // a way to discover which addresses have accounts of which kind.
      return fail("An account with that email already exists", 409);
    }

    const user = account.user;

    try {
      await TeacherProfile.create({
        userId: user._id,
        collegeId: college._id,
        collegeName: college.name,
        departmentId: department?._id ?? null,
        departmentName: department?.name ?? null,
        employeeId: input.employeeId?.trim() || null,
        designation: input.designation?.trim() || null,
        phone: input.phone?.trim() || null,
        /**
         * Pending unless a deployment has explicitly opted out (§4).
         *
         * Auto-approval is off by default because approving every
         * self-declared teacher would let anyone with an email address publish
         * to a college's students — the one failure in this module with no
         * undo.
         */
        status: teacherAutoApproveEnabled() ? "active" : "pending",
        ...(teacherAutoApproveEnabled() ? { approvedAt: new Date() } : {}),
      });
    } catch (err) {
      /**
       * The account exists and the profile does not — a teacher who can sign
       * in to a screen that cannot describe them. Removing the account is the
       * only state that lets them simply try again.
       */
      await user.deleteOne().catch(() => undefined);
      throw err;
    }

    await startSession({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // A delivery failure does not fail the request: the account is in a valid
    // unverified state and the recourse is a resend, not a second sign-up.
    const delivery = await sendVerification(
      {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        emailVerified: false,
      },
      { enforceRateLimit: false }
    );

    return ok(
      {
        teacher: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          collegeName: college.name,
          status: teacherAutoApproveEnabled() ? "active" : "pending",
        },
        emailVerificationSent: delivery.status === "sent",
        next: "/verify-email",
      },
      201
    );
  } catch (err) {
    return handleError(err);
  }
}
