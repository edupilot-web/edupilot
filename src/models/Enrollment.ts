import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

const enrollmentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    completedLessons: [{ type: Schema.Types.ObjectId, ref: "Lesson" }],
    progress: { type: Number, default: 0, min: 0, max: 100 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A student enrolls in a given course at most once.
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

export type EnrollmentDoc = InferSchemaType<typeof enrollmentSchema>;

resetModelInDev("Enrollment");

export const Enrollment: Model<EnrollmentDoc> =
  (mongoose.models.Enrollment as Model<EnrollmentDoc>) ||
  mongoose.model<EnrollmentDoc>("Enrollment", enrollmentSchema);
