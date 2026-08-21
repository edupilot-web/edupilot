import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * Directory backing the college autocomplete in onboarding.
 *
 * Seeded from a curated list (`npm run seed:colleges`) and appended to when a
 * student types a name we do not have. Those two origins are told apart by
 * `source`, so a later clean-up can review what students added without
 * touching the curated rows.
 */
const collegeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    /**
     * Lower-cased, punctuation-stripped `name`. Unique, so "St. Xavier's" and
     * "St Xaviers" cannot both be added as separate colleges by two students
     * typing the same institution slightly differently.
     */
    normalizedName: { type: String, required: true, unique: true, maxlength: 160 },
    city: { type: String, default: null, trim: true, maxlength: 80 },
    state: { type: String, default: null, trim: true, maxlength: 80 },
    /** "seed" for the curated list, "user" for names typed during onboarding. */
    source: { type: String, enum: ["seed", "user"], default: "seed" },
  },
  { timestamps: true }
);

/**
 * Prefix search runs against this with an anchored regex, which can use the
 * index; a `$text` index would rank whole words instead and would not match
 * "andhra u" halfway through typing.
 */
collegeSchema.index({ normalizedName: 1, name: 1 });

export type CollegeDoc = InferSchemaType<typeof collegeSchema>;

resetModelInDev("College");

export const College: Model<CollegeDoc> =
  (mongoose.models.College as Model<CollegeDoc>) ||
  mongoose.model<CollegeDoc>("College", collegeSchema);

/** Collapses the spelling differences that would otherwise duplicate a row. */
export function normalizeCollegeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 160);
}
