import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import { AUTONOMY_STATUSES, VERIFICATION_STATUSES } from "@/lib/admin/institution-fields";

/**
 * One entry in a college's autonomy history: granted, renewed, lapsed, revoked.
 *
 * Autonomy is not a boolean (spec §9). It is granted by a named authority — UGC,
 * AICTE, or the affiliating university — for a fixed period, under a reference
 * number, and it is renewed or allowed to lapse. A `isAutonomous: true` flag
 * answers none of the questions an admin verifying a college actually has:
 * since when, until when, on whose authority, and where is the order.
 *
 * `College.autonomyStatus` holds the current value derived from these rows and
 * is written only by the code that writes them.
 */
const autonomyRecordSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },

    status: { type: String, enum: AUTONOMY_STATUSES, required: true },

    /** What happened, for the timeline. `granted` starts a period; `renewed` extends it. */
    event: {
      type: String,
      enum: ["granted", "renewed", "extended", "lapsed", "revoked", "verified", "corrected"],
      default: "granted",
    },

    validFrom: { type: Date, default: null },
    /** Null when open-ended or not yet decided. */
    validUntil: { type: Date, default: null },

    /** UGC, AICTE, or the affiliating university — free text; bodies vary by state. */
    approvalAuthority: { type: String, default: null, trim: true, maxlength: 200 },
    approvalReference: { type: String, default: null, trim: true, maxlength: 120 },
    approvalDate: { type: Date, default: null },
    documentUrl: { type: String, default: null, maxlength: 500 },

    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: "not-verified" },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },

    note: { type: String, default: null, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

/**
 * The timeline query. Sorted by `validFrom` with `createdAt` as the tiebreak,
 * because an imported history often has several entries sharing a date and the
 * order they were entered is the only signal left.
 */
autonomyRecordSchema.index({ collegeId: 1, validFrom: -1, createdAt: -1 });

export type AutonomyRecordDoc = InferSchemaType<typeof autonomyRecordSchema>;

resetModelInDev("AutonomyRecord");

export const AutonomyRecord: Model<AutonomyRecordDoc> =
  (mongoose.models.AutonomyRecord as Model<AutonomyRecordDoc>) ||
  mongoose.model<AutonomyRecordDoc>("AutonomyRecord", autonomyRecordSchema);
