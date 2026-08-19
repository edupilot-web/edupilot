import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Course } from "@/models/Course";
import { Lesson } from "@/models/Lesson";
import { Enrollment } from "@/models/Enrollment";
import { lessonUpdateSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { ok, fail, handleError, requireAuth, assertObjectId, HttpError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** GET /api/lessons/:id — body is gated behind enrolment unless it is a free preview. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    assertObjectId(id, "lesson id");
    await connectDB();

    const lesson = await Lesson.findById(id).lean();
    if (!lesson) return fail("Lesson not found", 404);

    if (lesson.isFreePreview) return ok({ lesson });

    const session = await getSession();
    if (!session) throw new HttpError(401, "Authentication required");

    const course = await Course.findById(lesson.course).select("instructor").lean();
    const isOwner = course?.instructor.toString() === session.sub;
    const isEnrolled = await Enrollment.exists({
      student: session.sub,
      course: lesson.course,
    });

    if (!isOwner && !isEnrolled && session.role !== "admin") {
      throw new HttpError(403, "Enroll in this course to view the lesson");
    }

    return ok({ lesson });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    assertObjectId(id, "lesson id");
    await connectDB();

    const lesson = await Lesson.findById(id);
    if (!lesson) return fail("Lesson not found", 404);

    const course = await Course.findById(lesson.course).select("instructor");
    if (course?.instructor.toString() !== session.sub && session.role !== "admin") {
      throw new HttpError(403, "Only the course owner can edit lessons");
    }

    lesson.set(lessonUpdateSchema.parse(await req.json()));
    await lesson.save();

    return ok({ lesson });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    assertObjectId(id, "lesson id");
    await connectDB();

    const lesson = await Lesson.findById(id);
    if (!lesson) return fail("Lesson not found", 404);

    const course = await Course.findById(lesson.course).select("instructor");
    if (course?.instructor.toString() !== session.sub && session.role !== "admin") {
      throw new HttpError(403, "Only the course owner can delete lessons");
    }

    await lesson.deleteOne();
    await Promise.all([
      Course.updateOne({ _id: lesson.course }, { $inc: { lessonCount: -1 } }),
      // Drop the lesson from any progress lists that referenced it.
      Enrollment.updateMany(
        { course: lesson.course },
        { $pull: { completedLessons: lesson._id } }
      ),
    ]);

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
