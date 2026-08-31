import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * A student asking for their college to be added (spec §36).
 *
 * Its own collection rather than a flag on the profile: a request outlives the
 * onboarding attempt that produced it, several students may ask for the same
 * institution, and an administrator works through these as a queue that has
 * nothing to do with any one account.
 *
 * The request never becomes a `College` on its own. An administrator reviews it
 * — the college directory is reference data that other students pick from, and
 * a self-service path into it would fill the list with duplicates and
 * misspellings within a week.
 */
const collegeRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Denormalised so the queue shows who asked without a join per row. */
    userName: { type: String, default: null, maxlength: 120 },
    userEmail: { type: String, default: null, lowercase: true, maxlength: 200 },

    collegeName: { type: String, required: true, trim: true, maxlength: 200 },
    /**
     * Lower-cased and stripped of punctuation, for the duplicate check.
     *
     * Stored rather than computed at query time so the unique index below can
     * use it: "A.B.C. College" and "ABC College" are the same request, and
     * comparing the display names would not catch that.
     */
    normalizedName: { type: String, required: true, maxlength: 200 },

    stateId: { type: Schema.Types.ObjectId, ref: "State", required: true, index: true },
    stateName: { type: String, default: null, maxlength: 80 },
    district: { type: String, default: null, trim: true, maxlength: 80 },
    city: { type: String, default: null, trim: true, maxlength: 80 },
    website: { type: String, default: null, trim: true, maxlength: 300 },

    /** What the student says their college is affiliated to, as free text. */
    universityHint: { type: String, default: null, trim: true, maxlength: 200 },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "duplicate"],
      default: "pending",
      index: true,
    },

    /** How many students have asked for this institution. */
    requestCount: { type: Number, default: 1 },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null, maxlength: 600 },
    /** Set when the request becomes a real college, so the student can be told. */
    resultingCollegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/**
 * One pending request per student per institution (spec §36).
 *
 * Partial rather than plain: the same student may legitimately ask again after a
 * rejection — perhaps with a corrected name — and a full unique index would
 * block that forever. Scoping it to `pending` blocks only the duplicate that
 * matters, the one sitting in the queue twice.
 */
collegeRequestSchema.index(
  { userId: 1, normalizedName: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

/** The admin queue's sort, and the "how many asked for this" rollup. */
collegeRequestSchema.index({ status: 1, createdAt: -1 });
collegeRequestSchema.index({ normalizedName: 1, stateId: 1 });

export type CollegeRequestDoc = InferSchemaType<typeof collegeRequestSchema>;

resetModelInDev("CollegeRequest");

export const CollegeRequest: Model<CollegeRequestDoc> =
  (mongoose.models.CollegeRequest as Model<CollegeRequestDoc>) ||
  mongoose.model<CollegeRequestDoc>("CollegeRequest", collegeRequestSchema);

/**
 * The comparison key for "is this the same college?".
 *
 * Drops punctuation, collapses whitespace and removes the words almost every
 * Indian institution name contains, so "Sri ABC College of Engineering &
 * Technology" and "ABC Engineering College" collide. Deliberately aggressive:
 * a false collision costs a student one extra sentence in the admin queue,
 * while a missed one costs a duplicate row in the directory everyone picks from.
 */
export function normalizeCollegeRequestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:sri|shri|the|of|and|for|dr|prof|late)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
