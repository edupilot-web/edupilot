import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { AUTH_PROVIDERS, ROLES } from "@/lib/user-fields";

export {
  ROLES,
  AUTH_PROVIDERS,
  DEGREES,
  STUDY_STATUSES,
  MIN_STUDY_YEAR,
  MAX_STUDY_YEAR,
} from "@/lib/user-fields";
export type { Role, AuthProvider, Degree, StudyStatus } from "@/lib/user-fields";

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
    /**
     * Which sign-in method created the account. Derived rather than trusted:
     * a `google` account is one that arrived through OAuth, and linking a
     * Google identity onto an existing password account leaves this as `email`
     * because the password is still a valid way in.
     */
    authProvider: { type: String, enum: AUTH_PROVIDERS, default: "email" },
    role: { type: String, enum: ROLES, default: "student" },
    avatarUrl: { type: String, default: null },

    /** Google's stable subject claim. Unset on password-only accounts. */
    googleId: { type: String, default: undefined },
    /** True when the provider vouched for the address, or we verified it. */
    emailVerified: { type: Boolean, default: false },

    /**
     * Sessions issued before this moment are refused.
     *
     * The only way to revoke a stateless JWT. Sessions here are signed tokens
     * with no server-side store, so a password reset would otherwise leave every
     * existing session working — which defeats the main reason people reset one:
     * they believe somebody else is in their account.
     *
     * Compared against the token's `iat` by the authoritative gates
     * (`requireAuth`, `getCurrentUser`, `getCurrentTeacher`), never by
     * `proxy.ts` — that runs before the database is reachable and is a cheap
     * cookie check by design.
     *
     * Null on every account that has never had a reason to revoke.
     */
    sessionsValidFrom: { type: Date, default: null },

    // Optional contact details. Not asked for during onboarding — see
    // docs/TECHNICAL.md; they are filled in later from the profile screen.
    phone: { type: String, default: null, trim: true, maxlength: 24 },
    city: { type: String, default: null, trim: true, maxlength: 80 },
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

/**
 * Whether the account still has to prove it owns its address.
 *
 * One condition, deliberately: the flag itself. Google accounts do not get a
 * second rule exempting them — they get `emailVerified: true` at creation,
 * because the provider has already established the identity, and asking again
 * would be a dead end for a user with no password to sign back in with.
 *
 * The rare Google account whose `email_verified` claim was false is therefore
 * treated like any other unconfirmed address: it is sent a link. Trusting an
 * address the provider itself would not vouch for is the one thing an
 * `authProvider === "google"` shortcut would quietly do.
 */
export function needsEmailVerification(user: { emailVerified?: boolean }): boolean {
  return user.emailVerified !== true;
}
