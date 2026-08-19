import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Lesson } from "@/models/Lesson";
import { Enrollment } from "@/models/Enrollment";
import { progressSchema } from "@/lib/validation";
import { ok, fail, handleError, requireAuth, assertObjectId, HttpError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/enrollments/:id/progress — mark a lesson complete or incomplete. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    assertObjectId(id, "enrollment id");
    await connectDB();

    const enrollment = await Enrollment.findById(id);
    if (!enrollment) return fail("Enrollment not found", 404);
    if (enrollment.student.toString() !== session.sub) {
      throw new HttpError(403, "You can only update your own progress");
    }

    const { lessonId, completed } = progressSchema.parse(await req.json());
    assertObjectId(lessonId, "lesson id");

    const lesson = await Lesson.findById(lessonId).select("course").lean();
    if (!lesson) return fail("Lesson not found", 404);
    if (lesson.course.toString() !== enrollment.course.toString()) {
      return fail("That lesson does not belong to this course", 400);
    }

    const done = new Set(enrollment.completedLessons.map((l) => l.toString()));
    if (completed) done.add(lessonId);
    else done.delete(lessonId);

    const totalLessons = await Lesson.countDocuments({ course: enrollment.course });
    const progress =
      totalLessons === 0 ? 0 : Math.round((done.size / totalLessons) * 100);

    enrollment.completedLessons = [...done].map(
      (l) => new mongoose.Types.ObjectId(l)
    );
    enrollment.progress = progress;
    enrollment.completedAt = progress === 100 ? new Date() : null;
    await enrollment.save();

    return ok({ enrollment });
  } catch (err) {
    return handleError(err);
  }
}
