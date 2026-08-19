import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Course } from "@/models/Course";
import { Enrollment } from "@/models/Enrollment";
import { enrollSchema } from "@/lib/validation";
import { ok, fail, handleError, requireAuth, assertObjectId } from "@/lib/api";

/** GET /api/enrollments — the signed-in student's enrolled courses. */
export async function GET() {
  try {
    const session = await requireAuth();
    await connectDB();

    const enrollments = await Enrollment.find({ student: session.sub })
      .populate({
        path: "course",
        select: "title slug coverImageUrl level lessonCount",
        populate: { path: "instructor", select: "name avatarUrl" },
      })
      .sort({ updatedAt: -1 })
      .lean();

    return ok({ enrollments });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/enrollments — enroll the signed-in user in a course. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    await connectDB();

    const { courseId } = enrollSchema.parse(await req.json());
    assertObjectId(courseId, "course id");

    const course = await Course.findById(courseId).select("published").lean();
    if (!course) return fail("Course not found", 404);
    if (!course.published) return fail("This course is not open for enrollment", 400);

    const existing = await Enrollment.findOne({
      student: session.sub,
      course: courseId,
    });
    if (existing) return ok({ enrollment: existing });

    const enrollment = await Enrollment.create({
      student: session.sub,
      course: courseId,
    });

    return ok({ enrollment }, 201);
  } catch (err) {
    return handleError(err);
  }
}
