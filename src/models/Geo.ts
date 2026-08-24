import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * State → District → City: the spine every institution and student location
 * hangs off.
 *
 * Three collections rather than three enums, because the seed covers Andhra
 * Pradesh and Telangana and the rest of India arrives later. Nothing in the
 * application names a state — "AP and Telangana first" is a fact about the
 * seed data, not about the code (spec §47).
 *
 * Each level carries a denormalised copy of the level above it (`stateCode` on
 * a district, `stateId` on a city). A college table showing 50 rows would
 * otherwise need two lookups per row to print "Tirupati, Andhra Pradesh".
 */

const stateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** ISO 3166-2 subdivision code without the country prefix: AP, TS, KA. */
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 5 },
    /** "state" or "union-territory" — they differ administratively, not structurally. */
    kind: { type: String, enum: ["state", "union-territory"], default: "state" },
    /** Hides a state from the pickers without deleting its districts. */
    active: { type: Boolean, default: true },
    /** Sorts the pickers so the launch states lead. Lower sorts first. */
    displayOrder: { type: Number, default: 100 },
  },
  { timestamps: true }
);

stateSchema.index({ displayOrder: 1, name: 1 });

export type StateDoc = InferSchemaType<typeof stateSchema>;
resetModelInDev("State");
export const State: Model<StateDoc> =
  (mongoose.models.State as Model<StateDoc>) || mongoose.model<StateDoc>("State", stateSchema);

const districtSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    stateId: { type: Schema.Types.ObjectId, ref: "State", required: true, index: true },
    /** Denormalised from the state, so a district row renders without a join. */
    stateCode: { type: String, required: true, uppercase: true, maxlength: 5 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/**
 * District names repeat across states — there is a Nizamabad in Telangana and
 * nothing stops another state adding one. Unique per state, never globally.
 */
districtSchema.index({ stateId: 1, name: 1 }, { unique: true });

export type DistrictDoc = InferSchemaType<typeof districtSchema>;
resetModelInDev("District");
export const District: Model<DistrictDoc> =
  (mongoose.models.District as Model<DistrictDoc>) ||
  mongoose.model<DistrictDoc>("District", districtSchema);

const citySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    districtId: { type: Schema.Types.ObjectId, ref: "District", required: true, index: true },
    stateId: { type: Schema.Types.ObjectId, ref: "State", required: true, index: true },
    /** Optional: many small towns share a pincode range rather than owning one. */
    pincode: { type: String, default: null, trim: true, maxlength: 6 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

citySchema.index({ districtId: 1, name: 1 }, { unique: true });

export type CityDoc = InferSchemaType<typeof citySchema>;
resetModelInDev("City");
export const City: Model<CityDoc> =
  (mongoose.models.City as Model<CityDoc>) || mongoose.model<CityDoc>("City", citySchema);

/** Indian pincodes are six digits and never start with zero. */
export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export function isValidPincode(value: string): boolean {
  return PINCODE_PATTERN.test(value.trim());
}
