import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  ACCREDITATION_BODIES,
  MANAGEMENT_TYPES,
  MIN_ESTABLISHED_YEAR,
  RECORD_STATUSES,
  UNIVERSITY_TYPES,
  VERIFICATION_STATUSES,
} from "@/lib/admin/institution-fields";

/**
 * An affiliating body: a university, a deemed university, or an institute of
 * national importance that colleges hang off.
 *
 * Separate from `College` even though both are "institutions", because the
 * relationship between them is the point — one university has many colleges,
 * and that edge carries its own dates and documents (see `Affiliation`).
 * Collapsing the two into one self-referencing collection would make every
 * college query filter on type first.
 */
const universitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    /** Lower-cased, punctuation-stripped `name`. Unique; powers search and de-duplication. */
    normalizedName: { type: String, required: true, unique: true, maxlength: 200 },
    shortName: { type: String, default: null, trim: true, maxlength: 40 },
    /**
     * The code people actually use — JNTUH, SVU, OU. Unique when present, so an
     * import cannot quietly attach colleges to a second "JNTUH".
     */
    code: { type: String, default: undefined, uppercase: true, trim: true, maxlength: 20 },

    type: { type: String, enum: UNIVERSITY_TYPES, required: true },
    managementType: { type: String, enum: MANAGEMENT_TYPES, default: "State" },

    stateId: { type: Schema.Types.ObjectId, ref: "State", required: true, index: true },
    districtId: { type: Schema.Types.ObjectId, ref: "District", default: null, index: true },
    cityId: { type: Schema.Types.ObjectId, ref: "City", default: null },
    // Denormalised for tables and exports — see the note in Geo.ts.
    stateName: { type: String, default: null, maxlength: 80 },
    districtName: { type: String, default: null, maxlength: 80 },
    cityName: { type: String, default: null, maxlength: 80 },

    address: { type: String, default: null, trim: true, maxlength: 400 },
    pincode: { type: String, default: null, trim: true, maxlength: 6 },
    website: { type: String, default: null, trim: true, maxlength: 300 },
    email: { type: String, default: null, lowercase: true, trim: true, maxlength: 200 },
    phone: { type: String, default: null, trim: true, maxlength: 40 },
    logoUrl: { type: String, default: null },

    establishedYear: { type: Number, default: null, min: MIN_ESTABLISHED_YEAR },

    /** UGC 2(f)/12(B), AICTE approval and similar — free text, one line each. */
    recognitions: { type: [String], default: [] },

    accreditations: {
      type: [
        {
          _id: false,
          body: { type: String, enum: ACCREDITATION_BODIES, required: true },
          grade: { type: String, default: null, maxlength: 20 },
          score: { type: Number, default: null },
          validFrom: { type: Date, default: null },
          validUntil: { type: Date, default: null },
        },
      ],
      default: [],
    },

    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: "not-verified", index: true },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    verificationNote: { type: String, default: null, maxlength: 1000 },

    status: { type: String, enum: RECORD_STATUSES, default: "active", index: true },

    /**
     * Maintained by the affiliation writes rather than counted on demand: the
     * university list shows it on every row, and a `countDocuments` per row is
     * the query that stops working at a thousand universities.
     */
    collegeCount: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    /** Set when the row came from a bulk import, so it can be traced back. */
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

/** Partial unique: a university may legitimately have no code yet. */
universitySchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } }
);
universitySchema.index({ stateId: 1, type: 1 });
universitySchema.index({ normalizedName: 1, name: 1 });

export type UniversityDoc = InferSchemaType<typeof universitySchema>;

resetModelInDev("University");

export const University: Model<UniversityDoc> =
  (mongoose.models.University as Model<UniversityDoc>) ||
  mongoose.model<UniversityDoc>("University", universitySchema);
