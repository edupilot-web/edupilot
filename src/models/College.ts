import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  ACCREDITATION_BODIES,
  AUTONOMY_STATUSES,
  INSTITUTION_TYPES,
  MANAGEMENT_TYPES,
  MIN_ESTABLISHED_YEAR,
  RECORD_STATUSES,
  VERIFICATION_STATUSES,
} from "@/lib/admin/institution-fields";

/**
 * A college — the centre of the institution master data.
 *
 * This is the same collection students search during onboarding. One directory,
 * administered here and consumed there: a second "admin colleges" collection
 * would drift from the one students actually pick from within a week.
 *
 * Two things are deliberately *not* fields on this document:
 *
 * - **Affiliation.** A college's relationship to a university has dates and can
 *   change (spec §8), so it lives in `Affiliation` as a period. What is kept
 *   here is a denormalised pointer to the *current* one, for tables and search.
 * - **Autonomy.** Likewise a status with a history and an approving authority
 *   (spec §9), kept in `AutonomyRecord`. `autonomyStatus` here is the current
 *   value of that history, never the source of truth.
 *
 * The denormalised copies exist because the college table shows university,
 * district and autonomy on every one of fifty rows, and resolving those through
 * three collections per row is the query that fails at scale. They are written
 * only by the code that writes the underlying record.
 */
const collegeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    /**
     * Lower-cased, punctuation-stripped `name`. Unique, so "St. Xavier's" and
     * "St Xaviers" cannot both be added by two people typing the same college.
     * Also what the student-facing autocomplete searches.
     */
    normalizedName: { type: String, required: true, unique: true, maxlength: 200 },
    /** The full legal name, when it differs from what people call it. */
    officialName: { type: String, default: null, trim: true, maxlength: 250 },
    shortName: { type: String, default: null, trim: true, maxlength: 60 },
    /** AICTE/university/EAMCET code. Unique when present. */
    code: { type: String, default: undefined, uppercase: true, trim: true, maxlength: 20 },

    institutionType: { type: String, enum: INSTITUTION_TYPES, default: "Affiliated College", index: true },
    managementType: { type: String, enum: MANAGEMENT_TYPES, default: "Private Unaided", index: true },

    // ── Current affiliation, denormalised from the live `Affiliation` row ────
    universityId: { type: Schema.Types.ObjectId, ref: "University", default: null, index: true },
    universityName: { type: String, default: null, maxlength: 200 },
    universityCode: { type: String, default: null, maxlength: 20 },
    currentAffiliationId: { type: Schema.Types.ObjectId, ref: "Affiliation", default: null },

    // ── Current autonomy, denormalised from the live `AutonomyRecord` ────────
    autonomyStatus: { type: String, enum: AUTONOMY_STATUSES, default: "non-autonomous", index: true },
    autonomousSince: { type: Date, default: null },

    // ── Location ────────────────────────────────────────────────────────────
    stateId: { type: Schema.Types.ObjectId, ref: "State", default: null, index: true },
    districtId: { type: Schema.Types.ObjectId, ref: "District", default: null, index: true },
    cityId: { type: Schema.Types.ObjectId, ref: "City", default: null },
    stateName: { type: String, default: null, maxlength: 80 },
    districtName: { type: String, default: null, maxlength: 80 },
    cityName: { type: String, default: null, maxlength: 80 },
    address: { type: String, default: null, trim: true, maxlength: 400 },
    pincode: { type: String, default: null, trim: true, maxlength: 6 },
    /** `[longitude, latitude]` — GeoJSON order, which is the reverse of how it reads. */
    location: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined },
    },

    // ── Contact ─────────────────────────────────────────────────────────────
    website: { type: String, default: null, trim: true, maxlength: 300 },
    email: { type: String, default: null, lowercase: true, trim: true, maxlength: 200 },
    phone: { type: String, default: null, trim: true, maxlength: 40 },
    logoUrl: { type: String, default: null },
    establishedYear: { type: Number, default: null, min: MIN_ESTABLISHED_YEAR },

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

    // ── Verification (the shared framework, spec §19) ────────────────────────
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: "not-verified", index: true },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    verificationNote: { type: String, default: null, maxlength: 1000 },
    /** Set when a college is put into the queue, so "waiting since" is answerable. */
    verificationRequestedAt: { type: Date, default: null },

    status: { type: String, enum: RECORD_STATUSES, default: "active", index: true },

    /**
     * Students whose profile names this college. Recounted by a job rather than
     * incremented per signup — a drifted count is a cosmetic problem, and an
     * `$inc` on every registration is contention on a hot document.
     */
    studentCount: { type: Number, default: 0 },
    departmentCount: { type: Number, default: 0 },
    programCount: { type: Number, default: 0 },

    /** Where the row came from. `student` means someone typed it during onboarding. */
    source: {
      type: String,
      enum: ["seed", "admin", "import", "student"],
      default: "admin",
      index: true,
    },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    /** Free-form admin notes. Never shown to students. */
    internalNotes: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: true }
);

collegeSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } }
);

/**
 * The college list's default sort and its commonest filters. Compound rather
 * than three single-field indexes, because the list nearly always filters by
 * state *and* something else before sorting.
 */
collegeSchema.index({ stateId: 1, districtId: 1, name: 1 });
collegeSchema.index({ verificationStatus: 1, updatedAt: -1 });
collegeSchema.index({ universityId: 1, name: 1 });
collegeSchema.index({ normalizedName: 1, name: 1 });

/**
 * Full-text search over the fields an admin actually types into the search box.
 * Weighted so a name match outranks an address that happens to contain the term.
 */
collegeSchema.index(
  { name: "text", officialName: "text", shortName: "text", code: "text", cityName: "text", districtName: "text" },
  {
    name: "college_search",
    weights: { name: 10, officialName: 8, shortName: 6, code: 6, cityName: 2, districtName: 2 },
  }
);

export type CollegeDoc = InferSchemaType<typeof collegeSchema>;

resetModelInDev("College");

export const College: Model<CollegeDoc> =
  (mongoose.models.College as Model<CollegeDoc>) ||
  mongoose.model<CollegeDoc>("College", collegeSchema);

/** Collapses the spelling differences that would otherwise duplicate a row. */
export function normalizeCollegeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 200);
}
