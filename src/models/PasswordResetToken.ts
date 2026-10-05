import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * A pending password reset.
 *
 * Deliberately **link only** — no six-digit code, unlike
 * `EmailVerificationToken`. The two flows look similar and are not: confirming
 * an address proves someone can read a mailbox, while resetting a password
 * hands over the account. A six-digit code is a million possibilities, which is
 * a reasonable online-guessing surface for the first and an unreasonable one for
 * the second. 256 bits of token is not guessable at all, and the only way to get
 * it is to read the mail — which is the thing being proved.
 *
 * The token is stored as a SHA-256 hash. A dump of this collection is therefore
 * useless: it contains no value that can be presented to the reset endpoint.
 */
const passwordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /** SHA-256 of the raw token, hex. Unique, so a lookup is a point read. */
    tokenHash: { type: String, required: true, unique: true },

    /**
     * The address the link was sent to.
     *
     * Kept so a reset cannot be completed after the account's email has since
     * changed — the link was sent to whoever held *that* mailbox, and if the
     * address has moved on, so has the authority the link represents.
     */
    sentTo: { type: String, required: true },

    expiresAt: { type: Date, required: true },

    /**
     * Set the moment the token is spent.
     *
     * A row is kept rather than deleted so a second click on the same link can
     * say "this link has already been used" instead of "this link is invalid" —
     * a real difference to somebody who has just reset their password in another
     * tab and is wondering whether it worked. The TTL clears it later.
     */
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * TTL index: mongod removes the row within a minute or so of `expiresAt`.
 *
 * Housekeeping, not enforcement — the sweep runs on its own schedule, so
 * `consumeReset` compares the expiry itself rather than trusting that an expired
 * row is already gone.
 */
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetTokenDoc = InferSchemaType<typeof passwordResetTokenSchema>;

resetModelInDev("PasswordResetToken");

export const PasswordResetToken: Model<PasswordResetTokenDoc> =
  (mongoose.models.PasswordResetToken as Model<PasswordResetTokenDoc>) ||
  mongoose.model<PasswordResetTokenDoc>("PasswordResetToken", passwordResetTokenSchema);
