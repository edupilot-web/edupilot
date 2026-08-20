import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

export const COURSE_LEVELS = ["beginner", "intermediate", "advanced"] as const;

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    description: { type: String, default: "", maxlength: 5000 },
    instructor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    level: { type: String, enum: COURSE_LEVELS, default: "beginner" },
    tags: { type: [String], default: [] },
    price: { type: Number, default: 0, min: 0 },
    coverImageUrl: { type: String, default: null },
    published: { type: Boolean, default: false, index: true },
    lessonCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

courseSchema.index({ title: "text", description: "text", tags: "text" });

export type CourseDoc = InferSchemaType<typeof courseSchema>;

resetModelInDev("Course");

export const Course: Model<CourseDoc> =
  (mongoose.models.Course as Model<CourseDoc>) ||
  mongoose.model<CourseDoc>("Course", courseSchema);
