import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * The curriculum layer: regulations and the subjects each one prescribes.
 *
 * This *extends* the existing academic hierarchy rather than duplicating it
 * (spec §1, §44). Nothing here re-declares a college, a department or a
 * programme — every document points at the rows those modules already own:
 *
 *   College ──┬─ Department  (the "branch")
 *             └─ Program     (carries `degree` — the "course" — and its
 *                             `departmentId`, so Course → Branch is a *view*
 *                             over data that already exists)
 *
 *   Regulation        scopes a curriculum version to a college + programme
 *   CurriculumSubject one subject, at one year/semester, under one regulation
 *
 * Two levels the platform had no model for at all — a regulation and a subject —
 * plus the year/semester coordinate, which lived only as `Program.durationYears`.
 */

// ── Regulation / curriculum version ───────────────────────────────────────

/**
 * A curriculum version, e.g. "R23".
 *
 * Scoped to a college *and* a programme, not global: JNTUK R23 for B.Tech is a
 * different document from an autonomous college's own R23, and the two
 * prescribe different subjects. A global regulation table would silently mix
 * them, which §44 forbids.
 *
 * `effectiveFromYear` is the admission year the regulation applies from, which
 * is how a college actually talks about it ("R23 applies to 2023 admissions
 * onward"). It is deliberately a number, not a reference to `AcademicYear`: a
 * regulation outlives any one academic year.
 */
const regulationSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    /** Denormalised so the cascade renders a label without a join per row. */
    collegeName: { type: String, default: null, maxlength: 200 },

    /**
     * The programme this regulation governs. Optional: a university-wide
     * regulation covers every programme at the college, and forcing a row per
     * programme would multiply one real-world document into dozens.
     */
    programId: { type: Schema.Types.ObjectId, ref: "Program", default: null, index: true },
    /** The degree the regulation covers when it is not tied to one programme. */
    degree: { type: String, default: null, trim: true, maxlength: 40, index: true },

    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 600 },

    effectiveFromYear: { type: Number, required: true, min: 1950, max: 2100 },
    effectiveToYear: { type: Number, default: null, min: 1950, max: 2100 },

    /** Total semesters the regulation defines — 8 for a four-year B.Tech. */
    totalSemesters: { type: Number, default: 8, min: 1, max: 16 },

    status: { type: String, enum: ["draft", "active", "superseded", "archived"], default: "active", index: true },
    subjectCount: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

/**
 * One regulation code per college and programme scope.
 *
 * `programId` is in the key because a college may run R23 for B.Tech and R23 for
 * M.Tech as separate documents. A partial filter is not needed: a null
 * `programId` is a legitimate distinct value here (the college-wide row), and
 * there can only be one of those per code.
 */
regulationSchema.index({ collegeId: 1, programId: 1, code: 1 }, { unique: true });
regulationSchema.index({ collegeId: 1, status: 1, effectiveFromYear: -1 });

export type RegulationDoc = InferSchemaType<typeof regulationSchema>;

resetModelInDev("Regulation");

export const Regulation: Model<RegulationDoc> =
  (mongoose.models.Regulation as Model<RegulationDoc>) ||
  mongoose.model<RegulationDoc>("Regulation", regulationSchema);

// ── Curriculum subject ────────────────────────────────────────────────────

/** Where a subject sits in a degree's shape. */
export const COURSE_TYPES = [
  "Core",
  "Elective",
  "Open Elective",
  "Professional Elective",
  "Lab",
  "Project",
  "Mandatory",
  "Audit",
] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

/**
 * One unit of a syllabus.
 *
 * A subdocument rather than its own collection: units are never queried
 * independently of their subject, they are always read as a set, and there are
 * five or six of them. A separate collection would buy a join and nothing else.
 *
 * This is the array the generator is grounded on (§9) — the reason AI content
 * cannot invent chapters is that these titles are handed to it as the outline.
 */
const syllabusUnitSchema = new Schema(
  {
    unitNumber: { type: Number, required: true, min: 1, max: 30 },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    /** The syllabus prose for the unit, verbatim from the curriculum document. */
    description: { type: String, default: null, maxlength: 4000 },
    /** Topic titles as the syllabus lists them. */
    topics: { type: [String], default: [] },
    /** Teaching hours allotted, when the curriculum states them. */
    hours: { type: Number, default: null, min: 0, max: 200 },
  },
  { _id: false }
);

const referenceBookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    authors: { type: String, default: null, trim: true, maxlength: 300 },
    publisher: { type: String, default: null, trim: true, maxlength: 200 },
    edition: { type: String, default: null, trim: true, maxlength: 40 },
    year: { type: Number, default: null },
    isbn: { type: String, default: null, trim: true, maxlength: 20 },
    /** Textbook or further reading — curricula distinguish the two. */
    kind: { type: String, enum: ["textbook", "reference"], default: "textbook" },

    /**
     * The catalogue row for this book, once one exists.
     *
     * The bibliography stays the source of what the syllabus *says* — a title
     * and an ISBN, verbatim from the curriculum document. This pointer is how it
     * reaches a book that has chapters and topics to read (`Textbook`), so the
     * ninety subjects already carrying books do not have to be rewritten, and a
     * book nobody has catalogued yet still displays exactly as it does today.
     *
     * Null is the normal state. It is not a foreign key the reader may rely on:
     * the mapping that actually drives the subject screen is `SubjectTextbook`,
     * which carries the unit-to-chapter alignment this field cannot.
     */
    textbookId: { type: Schema.Types.ObjectId, ref: "Textbook", default: null },
  },
  { _id: false }
);

/**
 * A subject as one regulation prescribes it, at one year and semester.
 *
 * The full academic coordinate is stored on the document — college, programme,
 * branch, regulation, year, semester — because that tuple is exactly what the
 * cascade filters on (§4 step 7) and what content is keyed by (§22). Resolving
 * it through joins on every lookup would make the hottest query in the module
 * the most expensive one.
 *
 * `academicYearId` is deliberately **absent**. A subject belongs to a
 * regulation and a semester, not to a calendar year — R23 semester 3 is the same
 * subject list in 2025-26 as in 2026-27. The academic year is a property of the
 * *content* generated for a cohort (§22), not of the curriculum itself.
 * Duplicating the subject per academic year would multiply the master data by
 * four and invite the two copies to drift.
 */
const curriculumSubjectSchema = new Schema(
  {
    // ── Academic coordinate ────────────────────────────────────────────────
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true, index: true },
    /** The Department row. "Branch" is the curriculum word for it. */
    branchId: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", required: true, index: true },

    /** Denormalised labels, so a subject renders without four joins. */
    collegeName: { type: String, default: null, maxlength: 200 },
    programName: { type: String, default: null, maxlength: 200 },
    branchName: { type: String, default: null, maxlength: 160 },
    regulationCode: { type: String, default: null, maxlength: 20 },
    degree: { type: String, default: null, maxlength: 40 },

    /** Study year (1 = first year) and semester within the whole programme. */
    year: { type: Number, required: true, min: 1, max: 8 },
    semester: { type: Number, required: true, min: 1, max: 16 },

    // ── Subject identity and metadata (spec §6) ───────────────────────────
    name: { type: String, required: true, trim: true, maxlength: 300 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },

    credits: { type: Number, default: null, min: 0, max: 30 },
    /** Lecture / tutorial / practical hours per week — the L-T-P triple. */
    lectureHours: { type: Number, default: null, min: 0, max: 40 },
    tutorialHours: { type: Number, default: null, min: 0, max: 40 },
    practicalHours: { type: Number, default: null, min: 0, max: 40 },

    courseType: { type: String, enum: COURSE_TYPES, default: "Core", index: true },

    prerequisites: { type: [String], default: [] },
    learningObjectives: { type: [String], default: [] },
    /** Course outcomes, which most regulations state separately from objectives. */
    outcomes: { type: [String], default: [] },

    /** Free-text syllabus, when the curriculum is not broken into units. */
    syllabusText: { type: String, default: null, maxlength: 20000 },
    units: { type: [syllabusUnitSchema], default: [] },
    referenceBooks: { type: [referenceBookSchema], default: [] },
    /** Links to curriculum PDFs, NPTEL courses and the like. */
    referenceMaterials: { type: [String], default: [] },

    status: { type: String, enum: ["active", "inactive", "archived"], default: "active", index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    sourceImportId: { type: Schema.Types.ObjectId, ref: "ImportJob", default: null },
  },
  { timestamps: true }
);

/**
 * The cascade's terminal query (§4 step 7, §43).
 *
 * Covers "subjects for this college + programme + branch + regulation at this
 * year and semester" with one index scan. Field order follows the cascade's own
 * order so a partially-specified prefix — everything up to regulation, say — is
 * still served by it.
 */
curriculumSubjectSchema.index({
  collegeId: 1,
  programId: 1,
  branchId: 1,
  regulationId: 1,
  year: 1,
  semester: 1,
  name: 1,
});

/**
 * One subject code per regulation *and branch*.
 *
 * The branch belongs in the key. A first-year subject like MA101 is genuinely
 * shared across CSE, IT and ECE, and each branch's curriculum lists it — so the
 * correct shape is one row per branch, not one row the three branches share.
 * Without `branchId` here, seeding three branches makes them overwrite each
 * other's `branchId` on the same document and two of the three lose the subject
 * entirely.
 *
 * Not keyed on semester: a code appearing at two semesters of one regulation is
 * a data error, and rejecting it on write is cheaper than reconciling two
 * syllabi later.
 */
curriculumSubjectSchema.index(
  { collegeId: 1, regulationId: 1, branchId: 1, code: 1 },
  { unique: true }
);
curriculumSubjectSchema.index({ regulationId: 1, year: 1, semester: 1 });
/** Server-side subject search (§21). */
curriculumSubjectSchema.index({ name: "text", code: "text" });

export type CurriculumSubjectDoc = InferSchemaType<typeof curriculumSubjectSchema>;
export type SyllabusUnit = InferSchemaType<typeof syllabusUnitSchema>;
export type ReferenceBook = InferSchemaType<typeof referenceBookSchema>;

resetModelInDev("CurriculumSubject");

export const CurriculumSubject: Model<CurriculumSubjectDoc> =
  (mongoose.models.CurriculumSubject as Model<CurriculumSubjectDoc>) ||
  mongoose.model<CurriculumSubjectDoc>("CurriculumSubject", curriculumSubjectSchema);

/**
 * The year a semester falls in, for a regulation with two semesters per year.
 *
 * Kept here rather than inlined at call sites so the cascade, the seeder and the
 * validator all agree: semester 3 is second year, not "year 3".
 */
export function yearForSemester(semester: number): number {
  return Math.ceil(semester / 2);
}

/** "2nd Year / 1st Semester" — the label the context summary shows (§5). */
export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The semester's position within its year — semester 3 is the 1st of year 2. */
export function semesterWithinYear(semester: number): number {
  return semester % 2 === 0 ? 2 : 1;
}
