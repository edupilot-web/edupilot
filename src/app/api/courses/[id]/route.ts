import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Course } from "@/models/Course";
import { Lesson } from "@/models/Lesson";
import { Enrollment } from "@/models/Enrollment";
import { courseUpdateSchema } from "@/lib/validation";
import { ok, fail, handleError, requireAuth, assertObjectId, HttpError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** Accepts either an ObjectId or a slug so course URLs can be readable. */
async function findCourse(id: string) {
  const byId = /^[0-9a-fA-F]{24}$/.test(id);
  return Course.findOne(byId ? { _id: id } : { slug: id }).populate(
    "instructor",
    "name email avatarUrl"
  );
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await connectDB();

    const course = await findCourse(id);
    if (!course) return fail("Course not found", 404);

    const lessons = await Lesson.find({ course: course._id })
      .sort({ order: 1, createdAt: 1 })
      .select("title order durationMinutes isFreePreview")
      .lean();

    return ok({ course, lessons });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    assertObjectId(id, "course id");
    await connectDB();

    const course = await Course.findById(id);
    if (!course) return fail("Course not found", 404);
    if (course.instructor.toString() !== session.sub && session.role !== "admin") {
      throw new HttpError(403, "Only the course owner can edit this course");
    }

    const body = courseUpdateSchema.parse(await req.json());
    course.set(body);
    await course.save();

    return ok({ course });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    assertObjectId(id, "course id");
    await connectDB();

    const course = await Course.findById(id);
    if (!course) return fail("Course not found", 404);
    if (course.instructor.toString() !== session.sub && session.role !== "admin") {
      throw new HttpError(403, "Only the course owner can delete this course");
    }

    // Remove dependent documents so no lessons or enrollments are orphaned.
    await Promise.all([
      Lesson.deleteMany({ course: course._id }),
      Enrollment.deleteMany({ course: course._id }),
    ]);
    await course.deleteOne();

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
