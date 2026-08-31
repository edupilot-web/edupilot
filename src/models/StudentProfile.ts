import mongoose, { Schema, Model, InferSchemaType, Types } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  DEGREES,
  MAX_STUDY_YEAR,
  MIN_GRADUATION_YEAR,
  MIN_STUDY_YEAR,
  STUDY_STATUSES,
} from "@/lib/user-fields";

/**
 * The academic half of an account, collected in onboarding.
 *
 * Its own collection rather than a subdocument on `users`: it is written by a
 * different flow, read by the parts of the app that personalise curriculum and
 * placements, and will grow fields (CGPA, backlogs, semester) that have nothing
 * to do with signing in.
 */
const studentProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    /**
     * The matched entry in `colleges`, or null when the student typed a name we
     * do not have yet. Storing the free text either way means an unmatched
     * college still displays correctly, and a later backfill can attach the id
     * without touching what the user sees.
     */
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },
    collegeName: { type: String, required: true, trim: true, maxlength: 160 },

    degree: { type: String, enum: DEGREES, required: true },
    specialization: { type: String, required: true, trim: true, maxlength: 120 },

    /** `studying` or `graduated`. Decides whether `currentYear` applies. */
    studyStatus: { type: String, enum: STUDY_STATUSES, default: "studying" },

    /** Null once graduated — there is no current year to hold. */
    currentYear: {
      type: Number,
      default: null,
      min: MIN_STUDY_YEAR,
      max: MAX_STUDY_YEAR,
    },

    /** Expected while studying, actual once graduated. */
    graduationYear: {
      type: Number,
      required: true,
      min: MIN_GRADUATION_YEAR,
    },

    // ── Academic coordinate ───────────────────────────────────────────────
    /**
     * The full academic identity, resolved against the same curriculum data the
     * admin module configures — never a parallel copy of it.
     *
     * Every id here is verified server-side on write: the programme must belong
     * to the college, the branch to the programme, the regulation to that
     * configuration, and each subject to the whole tuple. The browser's claims
     * are discarded, exactly as they are for AI generation.
     *
     * All nullable, because most colleges have no curriculum configured yet.
     * A student at such a college completes onboarding with the levels that do
     * exist, and the profile fills in later when an administrator adds the rest
     * — which is why these are additions rather than replacements for
     * `collegeName`, `degree` and `specialization` above. Those three stay the
     * free-text fallback and keep every existing profile valid.
     */
    stateId: { type: Schema.Types.ObjectId, ref: "State", default: null, index: true },
    stateName: { type: String, default: null, maxlength: 80 },

    universityId: { type: Schema.Types.ObjectId, ref: "University", default: null, index: true },
    universityName: { type: String, default: null, maxlength: 200 },

    /** Copied from the college at write time, so the profile reads standalone. */
    institutionType: { type: String, default: null, maxlength: 60 },
    autonomyStatus: { type: String, default: null, maxlength: 40 },

    /** The `Program` row. "Course" is the student-facing word for it. */
    programId: { type: Schema.Types.ObjectId, ref: "Program", default: null, index: true },
    programName: { type: String, default: null, maxlength: 200 },

    /** The `Department` row. "Branch" is the student-facing word for it. */
    branchId: { type: Schema.Types.ObjectId, ref: "Department", default: null, index: true },
    branchName: { type: String, default: null, maxlength: 160 },

    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", default: null, index: true },
    regulationCode: { type: String, default: null, maxlength: 20 },

    /**
     * The year the student was admitted — deliberately not the current academic
     * year. A 2023-batch student in their third year and a 2025-batch student in
     * their first are both "studying now"; only the admission year distinguishes
     * which regulation and curriculum apply to them.
     */
    admissionYear: { type: Number, default: null, min: 1980, max: 2100 },

    /**
     * Lateral entry students start in year 2, so year cannot be derived from the
     * admission year alone, and their graduation is one year earlier than the
     * course duration would suggest.
     */
    admissionType: {
      type: String,
      enum: ["regular", "lateral-entry", "other"],
      default: "regular",
    },

    /** Semester within the whole programme — 3 is the first of second year. */
    currentSemester: { type: Number, default: null, min: 1, max: 16 },

    /**
     * Subjects the student is taking this semester.
     *
     * Ids into `curriculumsubjects`, so a subject the admin edits is the same
     * row the student holds. Never free text: a typed subject name could not be
     * grounded on a syllabus, and would create a second vocabulary nobody can
     * reconcile.
     */
    subjectIds: { type: [Schema.Types.ObjectId], ref: "CurriculumSubject", default: [] },

    /**
     * How far through onboarding the student is, so a closed browser can resume
     * where it stopped (spec §33). The step key, not a number, because the flow
     * skips steps that do not apply and a number would point at the wrong one.
     */
    onboardingStep: { type: String, default: null, maxlength: 40 },

    /**
     * Set by the code that writes the profile, from `isProfileComplete` below,
     * so the value can never drift from the fields it summarises.
     */
    profileCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/**
 * Reverse lookups: "every student on this regulation", "everyone in semester 3
 * of CSE at this college" (spec §47).
 *
 * A compound index rather than one per field, because the queries that matter
 * are conjunctions — a cohort is a college *and* a programme *and* a semester —
 * and the single-field indexes declared above already serve the narrow cases.
 */
studentProfileSchema.index({ collegeId: 1, programId: 1, branchId: 1, currentSemester: 1 });
studentProfileSchema.index({ regulationId: 1, currentSemester: 1 });
studentProfileSchema.index({ stateId: 1, admissionYear: 1 });

studentProfileSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.__v;
    return ret;
  },
});

export type StudentProfileDoc = InferSchemaType<typeof studentProfileSchema>;

resetModelInDev("StudentProfile");

export const StudentProfile: Model<StudentProfileDoc> =
  (mongoose.models.StudentProfile as Model<StudentProfileDoc>) ||
  mongoose.model<StudentProfileDoc>("StudentProfile", studentProfileSchema);

/** The shape onboarding must fill in before the app opens up. */
export type ProfileCompletionInput = {
  collegeName?: string | null;
  degree?: string | null;
  specialization?: string | null;
  studyStatus?: string | null;
  currentYear?: number | null;
  graduationYear?: number | null;
};

/**
 * Whether every required onboarding field is present.
 *
 * `currentYear` is required only while studying: demanding one from a graduate
 * would leave them unable to finish, and demanding none would let a first-year
 * through with no year at all.
 */
export function isProfileComplete(profile: ProfileCompletionInput | null): boolean {
  if (!profile) return false;
  if (!profile.collegeName?.trim()) return false;
  if (!profile.degree) return false;
  if (!profile.specialization?.trim()) return false;
  if (!profile.graduationYear) return false;
  if (profile.studyStatus === "graduated") return true;
  return typeof profile.currentYear === "number" && profile.currentYear >= MIN_STUDY_YEAR;
}

export type StudentProfileId = Types.ObjectId;
