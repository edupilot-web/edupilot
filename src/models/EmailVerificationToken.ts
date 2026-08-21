import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * A pending "verify your address" link.
 *
 * Only the SHA-256 hash of the token is stored. A leaked database dump is then
 * useless for verifying anyone's address, because the value that goes in the
 * email cannot be recovered from the value that goes in the row.
 */
const emailVerificationTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** SHA-256 of the raw token, hex encoded. Unique so a lookup is a point read. */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * TTL index: mongod removes the row within a minute or so of `expiresAt`.
 *
 * This is housekeeping, not enforcement — the sweep runs on its own schedule,
 * so `verifyEmailToken` still compares the expiry itself rather than trusting
 * that an expired row is already gone.
 */
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EmailVerificationTokenDoc = InferSchemaType<
  typeof emailVerificationTokenSchema
>;

resetModelInDev("EmailVerificationToken");

export const EmailVerificationToken: Model<EmailVerificationTokenDoc> =
  (mongoose.models.EmailVerificationToken as Model<EmailVerificationTokenDoc>) ||
  mongoose.model<EmailVerificationTokenDoc>(
    "EmailVerificationToken",
    emailVerificationTokenSchema
  );
