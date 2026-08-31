import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * A pending address confirmation — the 6-digit code the student types and the
 * link they can click instead. One row holds both, so they share an expiry and
 * a resend replaces the pair rather than leaving a stale half behind.
 *
 * Neither credential is stored in a recoverable form. The token is stored as a
 * SHA-256 hash; the code as an HMAC keyed with a server secret, because a
 * six-digit space is small enough to brute-force from a plain hash (see
 * `email-verification.ts`).
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
    /** HMAC-SHA256 of the 6-digit code, hex encoded. Never queried by value. */
    codeHash: { type: String, required: true },
    /**
     * Wrong codes entered against this row.
     *
     * The hard stop on online guessing: past `MAX_CODE_ATTEMPTS` the row is
     * destroyed and the student has to request a fresh code. Counted here
     * rather than only in the rate limiter because that one deliberately fails
     * open, and this control must not.
     */
    attempts: { type: Number, required: true, default: 0 },
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
