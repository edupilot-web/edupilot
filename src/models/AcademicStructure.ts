import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  DEPARTMENT_STATUSES,
  MAX_PROGRAM_YEARS,
  MIN_PROGRAM_YEARS,
  PROGRAM_LEVELS,
  PROGRAM_MODES,
  RECORD_STATUSES,
} from "@/lib/admin/institution-fields";

/**
 * The three levels below a college: Campus → Department → Program.
 *
 * One file because they are only ever used together and their schemas are
 * small; splitting them would mean three imports at every call site for no
 * gain in isolation.
 *
 * "Program" rather than "Course" because `Course` is already taken by the
 * learning-content model (a course made of lessons). The admin UI still labels
 * this "Courses / Programs", which is what the domain calls it — the collision
 * is a naming problem in code, not in the product.
 */

const campusSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, default: null, uppercase: true, trim: true, maxlength: 20 },
    /** Exactly one campus per college should carry this. Enforced in the writer. */
    isPrimary: { type: Boolean, default: false },

    cityId: { type: Schema.Types.ObjectId, ref: "City", default: null },
    districtId: { type: Schema.Types.ObjectId, ref: "District", default: null },
    stateId: { type: Schema.Types.ObjectId, ref: "State", default: null },
    cityName: { type: String, default: null, maxlength: 80 },
    districtName: { type: String, default: null, maxlength: 80 },
    stateName: { type: String, default: null, maxlength: 80 },
    address: { type: String, default: null, trim: true, maxlength: 400 },
    pincode: { type: String, default: null, trim: true, maxlength: 6 },

    status: { type: String, enum: RECORD_STATUSES, default: "active" },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

campusSchema.index({ collegeId: 1, name: 1 }, { unique: true });

export type CampusDoc = InferSchemaType<typeof campusSchema>;
resetModelInDev("Campus");
export const Campus: Model<CampusDoc> =
  (mongoose.models.Campus as Model<CampusDoc>) || mongoose.model<CampusDoc>("Campus", campusSchema);

const departmentSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    campusId: { type: Schema.Types.ObjectId, ref: "Campus", default: null, index: true },
    collegeName: { type: String, default: null, maxlength: 200 },

    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, default: null, uppercase: true, trim: true, maxlength: 20 },
    /**
     * Groups equivalent departments across colleges — "Computer Science and
     * Engineering", "CSE" and "Computer Science & Engg." all map to `cse`.
     * Without it, "students by branch" cannot be answered across the platform.
     */
    canonicalKey: { type: String, default: null, index: true, maxlength: 60 },

    headOfDepartment: { type: String, default: null, trim: true, maxlength: 120 },
    hodEmail: { type: String, default: null, lowercase: true, trim: true, maxlength: 200 },
    establishedYear: { type: Number, default: null },

    status: { type: String, enum: DEPARTMENT_STATUSES, default: "active" },
    programCount: { type: Number, default: 0 },
    studentCount: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

departmentSchema.index({ collegeId: 1, name: 1 }, { unique: true });

export type DepartmentDoc = InferSchemaType<typeof departmentSchema>;
resetModelInDev("Department");
export const Department: Model<DepartmentDoc> =
  (mongoose.models.Department as Model<DepartmentDoc>) ||
  mongoose.model<DepartmentDoc>("Department", departmentSchema);

const programSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null, index: true },
    collegeName: { type: String, default: null, maxlength: 200 },
    departmentName: { type: String, default: null, maxlength: 160 },

    /** The full title: "B.Tech in Computer Science and Engineering". */
    name: { type: String, required: true, trim: true, maxlength: 200 },
    code: { type: String, default: null, uppercase: true, trim: true, maxlength: 20 },

    /** The award — B.Tech, MBA, B.Sc. Matches the student profile's `degree`. */
    degree: { type: String, required: true, trim: true, maxlength: 40 },
    /** The branch, matching the student profile's `specialization`. */
    specialization: { type: String, default: null, trim: true, maxlength: 120 },

    level: { type: String, enum: PROGRAM_LEVELS, default: "Undergraduate" },
    mode: { type: String, enum: PROGRAM_MODES, default: "Regular" },
    durationYears: {
      type: Number,
      default: 4,
      min: MIN_PROGRAM_YEARS,
      max: MAX_PROGRAM_YEARS,
    },
    /** Sanctioned seats, where the college publishes them. */
    intake: { type: Number, default: null, min: 0 },

    status: { type: String, enum: RECORD_STATUSES, default: "active" },
    studentCount: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

programSchema.index({ collegeId: 1, name: 1 }, { unique: true });
programSchema.index({ degree: 1, specialization: 1 });

export type ProgramDoc = InferSchemaType<typeof programSchema>;
resetModelInDev("Program");
export const Program: Model<ProgramDoc> =
  (mongoose.models.Program as Model<ProgramDoc>) ||
  mongoose.model<ProgramDoc>("Program", programSchema);

const academicYearSchema = new Schema(
  {
    /** "2026-27" — the label people use, and what appears in every picker. */
    label: { type: String, required: true, unique: true, trim: true, maxlength: 20 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    /**
     * Exactly one year is current. The writer clears the others, rather than a
     * unique index, because "no current year" is briefly valid mid-rollover.
     */
    isCurrent: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ["upcoming", "active", "closed"], default: "upcoming" },
  },
  { timestamps: true }
);

academicYearSchema.index({ startDate: -1 });

export type AcademicYearDoc = InferSchemaType<typeof academicYearSchema>;
resetModelInDev("AcademicYear");
export const AcademicYear: Model<AcademicYearDoc> =
  (mongoose.models.AcademicYear as Model<AcademicYearDoc>) ||
  mongoose.model<AcademicYearDoc>("AcademicYear", academicYearSchema);

/**
 * Reduces a department or branch name to the key that groups equivalents.
 *
 * Deliberately crude: lower-case, drop punctuation and the filler words that
 * differ between colleges without changing meaning. It will not catch every
 * variant, and it is not meant to — it turns the long tail of spellings into a
 * short tail that the Data Quality queue can show an admin.
 */
const FILLER = new Set(["and", "of", "the", "engineering", "engg", "dept", "department"]);

export function canonicalDepartmentKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !FILLER.has(word));
  return words.join("-").slice(0, 60);
}
