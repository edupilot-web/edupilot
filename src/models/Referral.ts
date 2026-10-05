import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { REFERRAL_STATUSES } from "@/lib/referrals/fields";

/**
 * Who invited whom, and what it earned.
 *
 * Two collections. `ReferralCode` is one row per student and changes almost
 * never; `Referral` is one row per person invited and is the record of what
 * happened. Keeping the code on the user document instead would work until the
 * first time somebody needs a second code, or one disabled for abuse.
 */

const referralCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    /**
     * Unique across the platform, and the reason issuing one retries.
     *
     * Eight characters from a 31-letter alphabet is about 8.5e11 codes, so a
     * collision is vanishingly unlikely — but "vanishingly unlikely" is not
     * "impossible", and the index is what makes the difference a retry rather
     * than two students sharing one code and one of them never being paid.
     */
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },

    /** Turned off for abuse. The rows it already earned are left alone. */
    disabled: { type: Boolean, default: false },

    /** Denormalised counters, so the share screen is one read. */
    signups: { type: Number, default: 0, min: 0 },
    rewarded: { type: Number, default: 0, min: 0 },
    earnedPaise: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export type ReferralCodeDoc = InferSchemaType<typeof referralCodeSchema>;

resetModelInDev("ReferralCode");

export const ReferralCode: Model<ReferralCodeDoc> =
  (mongoose.models.ReferralCode as Model<ReferralCodeDoc>) ||
  mongoose.model<ReferralCodeDoc>("ReferralCode", referralCodeSchema);

// ── The referral itself ───────────────────────────────────────────────────

const referralSchema = new Schema(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /**
     * **Unique.** One person is referred once, ever.
     *
     * This is the single most important line in the file. Without it, an
     * account that signs up, is rewarded, deletes its profile and signs up
     * again earns twice — and a database guarantee is the only version of this
     * check that survives two requests arriving together.
     */
    refereeId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    /** The code as it was used, kept even if the owner later changes theirs. */
    code: { type: String, required: true, index: true },

    status: { type: String, enum: REFERRAL_STATUSES, default: "pending", index: true },

    /** Set when the referee finished onboarding. Null while pending. */
    qualifiedAt: { type: Date, default: null },

    /**
     * What each side was actually paid, in paise.
     *
     * Recorded rather than recomputed from the current reward setting: an
     * operator who raises the bonus next term must not appear to have
     * retroactively paid everyone more, and the sum of these is what has to
     * reconcile against the wallet ledger.
     */
    referrerRewardPaise: { type: Number, default: 0, min: 0 },
    refereeRewardPaise: { type: Number, default: 0, min: 0 },

    /** For `rejected`: a key from `REJECTION_REASONS`. */
    rejectionReason: { type: String, default: null, maxlength: 40 },
  },
  { timestamps: true }
);

/** "Who have I invited", newest first. */
referralSchema.index({ referrerId: 1, createdAt: -1 });
/** The cap check: how many of mine have been rewarded. */
referralSchema.index({ referrerId: 1, status: 1 });

export type ReferralDoc = InferSchemaType<typeof referralSchema>;

resetModelInDev("Referral");

export const Referral: Model<ReferralDoc> =
  (mongoose.models.Referral as Model<ReferralDoc>) ||
  mongoose.model<ReferralDoc>("Referral", referralSchema);
