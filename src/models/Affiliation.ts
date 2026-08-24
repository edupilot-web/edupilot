import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  AFFILIATION_STATUSES,
  AFFILIATION_TYPES,
  VERIFICATION_STATUSES,
} from "@/lib/admin/institution-fields";

/**
 * One period during which a college was affiliated to a university.
 *
 * The edge between college and university is its own record because it has a
 * lifetime, and colleges really do move: a JNTUH-affiliated college can be
 * brought under Osmania, and a student who graduated before the change was
 * awarded a JNTUH degree. A `universityId` field on `College` alone would
 * rewrite that student's history the moment an admin updated the college
 * (spec §8).
 *
 * Exactly one row per college may be `active`. The application enforces that in
 * `setAffiliation()`, which closes the outgoing period before opening the new
 * one; a partial unique index cannot express it because "active" is also a
 * legitimate state for a *pending* row that has not started yet.
 */
const affiliationSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    universityId: { type: Schema.Types.ObjectId, ref: "University", required: true, index: true },

    // Denormalised so an affiliation timeline renders without two joins per row.
    collegeName: { type: String, default: null, maxlength: 200 },
    universityName: { type: String, default: null, maxlength: 200 },
    universityCode: { type: String, default: null, maxlength: 20 },

    type: { type: String, enum: AFFILIATION_TYPES, default: "affiliated" },
    status: { type: String, enum: AFFILIATION_STATUSES, default: "active", index: true },

    startDate: { type: Date, default: null },
    /** Null while the affiliation is open-ended — the common case for the live row. */
    endDate: { type: Date, default: null },

    /** The order/circular number the university issued. */
    referenceNumber: { type: String, default: null, trim: true, maxlength: 120 },
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

/** The timeline query: every period for one college, newest first. */
affiliationSchema.index({ collegeId: 1, startDate: -1 });
/** "Which colleges does this university affiliate right now?" */
affiliationSchema.index({ universityId: 1, status: 1 });

export type AffiliationDoc = InferSchemaType<typeof affiliationSchema>;

resetModelInDev("Affiliation");

export const Affiliation: Model<AffiliationDoc> =
  (mongoose.models.Affiliation as Model<AffiliationDoc>) ||
  mongoose.model<AffiliationDoc>("Affiliation", affiliationSchema);
