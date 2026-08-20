import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  MAX_STUDY_YEAR,
  MIN_STUDY_YEAR,
  PROGRAMS,
  ROLES,
} from "@/lib/user-fields";

export {
  ROLES,
  AUTH_PROVIDERS,
  PROGRAMS,
  MIN_STUDY_YEAR,
  MAX_STUDY_YEAR,
} from "@/lib/user-fields";
export type { Role, AuthProvider, Program } from "@/lib/user-fields";

const educationSchema = new Schema(
  {
    college: { type: String, required: true, trim: true, maxlength: 160 },
    program: { type: String, enum: PROGRAMS, required: true },
    currentYear: { type: Number, required: true, min: MIN_STUDY_YEAR, max: MAX_STUDY_YEAR },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Absent for Google accounts, which never set one.
    passwordHash: {
      type: String,
      select: false,
      required: function (this: { googleId?: string | null }) {
        return !this.googleId;
      },
    },
    role: { type: String, enum: ROLES, default: "student" },
    avatarUrl: { type: String, default: null },

    /** Google's stable subject claim. Unset on password-only accounts. */
    googleId: { type: String, default: undefined },
    /** True when the provider vouched for the address, or we verified it. */
    emailVerified: { type: Boolean, default: false },

    // Collected in onboarding step 1.
    phone: { type: String, default: null, trim: true, maxlength: 24 },
    city: { type: String, default: null, trim: true, maxlength: 80 },

    // Collected in onboarding step 2.
    education: { type: educationSchema, default: null },

    /** Null until the education step is submitted. Gates the app (see (app)/layout). */
    onboardingCompletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * Partial rather than sparse: a sparse unique index still treats an explicit
 * `null` as a value, so every password account would collide on the second one.
 */
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
);

userSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export type UserDoc = InferSchemaType<typeof userSchema>;

resetModelInDev("User");

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ||
  mongoose.model<UserDoc>("User", userSchema);

/** Whether the user still owes us the onboarding steps. */
export function needsOnboarding(user: { onboardingCompletedAt?: Date | null }): boolean {
  return !user.onboardingCompletedAt;
}
