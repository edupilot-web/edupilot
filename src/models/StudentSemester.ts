import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

export const SEMESTER_SUBJECT_SOURCES = [
  "prescribed",
  "student-selected",
  "admin-assigned",
] as const;
export type SemesterSubjectSource = (typeof SEMESTER_SUBJECT_SOURCES)[number];

/**
 * What one student is taking in one semester.
 *
 * `StudentProfile.subjectIds` cannot carry this on its own. It is a single flat
 * array with no semester on it, so the third-semester subjects have to be
 * overwritten to record the fourth — which destroys the only record of what the
 * student took, and with it any chance of showing a past semester, resuming
 * after a gap, or reporting on a cohort's history.
 *
 * The profile field is *kept* as the current-semester cache: every existing
 * write stays valid, the onboarding flow does not change, and the read path
 * prefers this collection when a row exists. That makes this an addition rather
 * than a migration.
 */
const studentSemesterSubjectsSchema = new Schema(
  {
    studentProfileId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      index: true,
    },
    /** Denormalised so cohort queries do not have to join through the profile. */
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /** Semester within the whole programme — 3 is the first of second year. */
    semester: { type: Number, required: true, min: 1, max: 16 },
    /** Derived from the semester, stored so a year filter needs no arithmetic. */
    year: { type: Number, required: true, min: 1, max: 8 },

    /**
     * The regulation these subjects were read from.
     *
     * Recorded per semester because a student can be moved onto a new
     * regulation mid-course, and last semester's subject list belongs to the
     * regulation it was drawn from — not to whichever one the profile points at
     * today.
     */
    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", default: null, index: true },

    subjectIds: { type: [Schema.Types.ObjectId], ref: "CurriculumSubject", default: [] },

    /**
     * Where the list came from. `prescribed` is the regulation's own core list,
     * filled in without asking; `student-selected` means an elective choice was
     * made; `admin-assigned` is a college overriding both.
     */
    source: { type: String, enum: SEMESTER_SUBJECT_SOURCES, default: "prescribed" },

    /**
     * When the student confirmed the list.
     *
     * Null means it was derived for them and never reviewed — which the screen
     * shows differently, because an unconfirmed elective is a question still
     * outstanding rather than a decision already made.
     */
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * One row per student per semester.
 *
 * The unique key is what makes the seeder and the enrolment write idempotent:
 * both upsert on it, so re-running either converges instead of accumulating
 * duplicate semesters.
 */
studentSemesterSubjectsSchema.index({ studentProfileId: 1, semester: 1 }, { unique: true });
/** "everyone in semester 3 on this regulation" — the cohort read. */
studentSemesterSubjectsSchema.index({ regulationId: 1, semester: 1 });

export type StudentSemesterSubjectsDoc = InferSchemaType<typeof studentSemesterSubjectsSchema>;

resetModelInDev("StudentSemesterSubjects");

export const StudentSemesterSubjects: Model<StudentSemesterSubjectsDoc> =
  (mongoose.models.StudentSemesterSubjects as Model<StudentSemesterSubjectsDoc>) ||
  mongoose.model<StudentSemesterSubjectsDoc>(
    "StudentSemesterSubjects",
    studentSemesterSubjectsSchema
  );
