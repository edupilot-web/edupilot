import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Course } from "@/models/Course";
import { Lesson } from "@/models/Lesson";
import { lessonCreateSchema } from "@/lib/validation";
import { ok, fail, handleError, requireAuth, assertObjectId, HttpError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** GET /api/courses/:id/lessons — full lesson list for a course. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    assertObjectId(id, "course id");
    await connectDB();

    const lessons = await Lesson.find({ course: id })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return ok({ lessons });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/courses/:id/lessons — course owner adds a lesson. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    assertObjectId(id, "course id");
    await connectDB();

    const course = await Course.findById(id);
    if (!course) return fail("Course not found", 404);
    if (course.instructor.toString() !== session.sub && session.role !== "admin") {
      throw new HttpError(403, "Only the course owner can add lessons");
    }

    const body = lessonCreateSchema.parse(await req.json());

    // Default to appending at the end of the current lesson list.
    const order = body.order ?? (await Lesson.countDocuments({ course: id }));

    const lesson = await Lesson.create({ ...body, order, course: id });
    await Course.updateOne({ _id: id }, { $inc: { lessonCount: 1 } });

    return ok({ lesson }, 201);
  } catch (err) {
    return handleError(err);
  }
}
