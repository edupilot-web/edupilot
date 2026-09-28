import { handleError, ok, fail } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { requireTeacher } from "@/lib/teaching/teacher";
import { teacherProfileUpdateSchema } from "@/lib/teaching/validation";
import { Department } from "@/models/AcademicStructure";
import { TeacherProfile } from "@/models/Teacher";
import { User } from "@/models/User";

/**
 * GET /api/teacher/profile — who the signed-in teacher is
 * PUT /api/teacher/profile — change their own details
 *
 * The college is **not** editable. It is the scope every other query in the
 * module is confined to, and letting a teacher change it would be letting them
 * choose which college's students they can publish to (§10). Moving colleges is
 * a new account, or an administrator's action — not a form field.
 *
 * `status` is not editable either, for the obvious version of the same reason.
 */
export async function GET() {
  try {
    const teacher = await requireTeacher();
    return ok({ teacher });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const teacher = await requireTeacher();

    const parsed = teacherProfileUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check the form and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const input = parsed.data;
    await connectDB();

    const update: Record<string, unknown> = {};

    if (input.departmentId !== undefined) {
      if (input.departmentId === null) {
        update.departmentId = null;
        update.departmentName = null;
      } else {
        // Scoped to the teacher's own college, so a department id from
        // elsewhere cannot be attached.
        const department = await Department.findOne({
          _id: input.departmentId,
          collegeId: teacher.collegeId,
        })
          .select("name")
          .lean();

        if (!department) {
          return fail("Choose a department from your college", 422, { field: "departmentId" });
        }

        update.departmentId = department._id;
        update.departmentName = department.name;
      }
    }

    for (const field of ["employeeId", "designation", "phone"] as const) {
      if (input[field] !== undefined) update[field] = input[field]?.trim() || null;
    }

    if (Object.keys(update).length) {
      await TeacherProfile.updateOne({ userId: teacher.userId }, { $set: update });
    }

    // The name lives on the account, not the profile — one place, shared with
    // every other surface that shows who this person is.
    if (input.name) {
      await User.updateOne({ _id: teacher.userId }, { $set: { name: input.name.trim() } });
    }

    return ok({ updated: true });
  } catch (err) {
    return handleError(err);
  }
}
