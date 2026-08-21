import mongoose, { Schema, Model, InferSchemaType, Types } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  DEGREES,
  MAX_STUDY_YEAR,
  MIN_GRADUATION_YEAR,
  MIN_STUDY_YEAR,
  STUDY_STATUSES,
} from "@/lib/user-fields";

/**
 * The academic half of an account, collected in onboarding.
 *
 * Its own collection rather than a subdocument on `users`: it is written by a
 * different flow, read by the parts of the app that personalise curriculum and
 * placements, and will grow fields (CGPA, backlogs, semester) that have nothing
 * to do with signing in.
 */
const studentProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    /**
     * The matched entry in `colleges`, or null when the student typed a name we
     * do not have yet. Storing the free text either way means an unmatched
     * college still displays correctly, and a later backfill can attach the id
     * without touching what the user sees.
     */
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },
    collegeName: { type: String, required: true, trim: true, maxlength: 160 },

    degree: { type: String, enum: DEGREES, required: true },
    specialization: { type: String, required: true, trim: true, maxlength: 120 },

    /** `studying` or `graduated`. Decides whether `currentYear` applies. */
    studyStatus: { type: String, enum: STUDY_STATUSES, default: "studying" },

    /** Null once graduated — there is no current year to hold. */
    currentYear: {
      type: Number,
      default: null,
      min: MIN_STUDY_YEAR,
      max: MAX_STUDY_YEAR,
    },

    /** Expected while studying, actual once graduated. */
    graduationYear: {
      type: Number,
      required: true,
      min: MIN_GRADUATION_YEAR,
    },

    /**
     * Set by the code that writes the profile, from `isProfileComplete` below,
     * so the value can never drift from the fields it summarises.
     */
    profileCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

studentProfileSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.__v;
    return ret;
  },
});

export type StudentProfileDoc = InferSchemaType<typeof studentProfileSchema>;

resetModelInDev("StudentProfile");

export const StudentProfile: Model<StudentProfileDoc> =
  (mongoose.models.StudentProfile as Model<StudentProfileDoc>) ||
  mongoose.model<StudentProfileDoc>("StudentProfile", studentProfileSchema);

/** The shape onboarding must fill in before the app opens up. */
export type ProfileCompletionInput = {
  collegeName?: string | null;
  degree?: string | null;
  specialization?: string | null;
  studyStatus?: string | null;
  currentYear?: number | null;
  graduationYear?: number | null;
};

/**
 * Whether every required onboarding field is present.
 *
 * `currentYear` is required only while studying: demanding one from a graduate
 * would leave them unable to finish, and demanding none would let a first-year
 * through with no year at all.
 */
export function isProfileComplete(profile: ProfileCompletionInput | null): boolean {
  if (!profile) return false;
  if (!profile.collegeName?.trim()) return false;
  if (!profile.degree) return false;
  if (!profile.specialization?.trim()) return false;
  if (!profile.graduationYear) return false;
  if (profile.studyStatus === "graduated") return true;
  return typeof profile.currentYear === "number" && profile.currentYear >= MIN_STUDY_YEAR;
}

export type StudentProfileId = Types.ObjectId;
