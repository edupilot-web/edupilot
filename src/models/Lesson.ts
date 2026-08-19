import mongoose, { Schema, Model, InferSchemaType } from "mongoose";

const lessonSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: "" },
    videoUrl: { type: String, default: null },
    durationMinutes: { type: Number, default: 0, min: 0 },
    order: { type: Number, default: 0 },
    isFreePreview: { type: Boolean, default: false },
  },
  { timestamps: true }
);

lessonSchema.index({ course: 1, order: 1 });

export type LessonDoc = InferSchemaType<typeof lessonSchema>;

export const Lesson: Model<LessonDoc> =
  (mongoose.models.Lesson as Model<LessonDoc>) ||
  mongoose.model<LessonDoc>("Lesson", lessonSchema);
