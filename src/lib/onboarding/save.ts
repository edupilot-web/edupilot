import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { StudentProfile } from "@/models/StudentProfile";
import { User } from "@/models/User";
import { CollegeRequest, normalizeCollegeRequestName } from "@/models/CollegeRequest";
import { College } from "@/models/College";
import { State } from "@/models/Geo";
import {
  isAcademicallyComplete,
  resolveStudentContext,
  type AcademicSelection,
  type ResolvedStudentContext,
} from "@/lib/onboarding/academic-context";
import { DEGREES, type Degree } from "@/lib/user-fields";

/**
 * Writing the academic profile (spec §26, §30, §33, §34).
 *
 * One function does the saving, because autosave and the final submit are the
 * same operation with a different completeness bar: a partial save must be
 * validated exactly as strictly as a final one, or a student could autosave a
 * tampered coordinate and then "complete" a profile nobody checked.
 *
 * The completion flag is always recomputed from the merged document, never
 * accepted from the caller (§34).
 */

/** The step keys the flow can resume at, in order (spec §7, §33). */
export const ONBOARDING_STEPS = [
  "personal",
  "state",
  "institution",
  "confirm",
  "course",
  "branch",
  "regulation",
  "batch",
  "semester",
  "subjects",
  "graduation",
  "review",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type SaveResult =
  | { ok: true; context: ResolvedStudentContext; completed: boolean; nextStep: OnboardingStep }
  | { ok: false; field: string; code: string; message: string };

/**
 * The step the student should be on, given what they have.
 *
 * Derived rather than incremented, so a resumed session lands correctly however
 * it was left, and so steps the college cannot supply are skipped rather than
 * shown empty (§7). This is also what makes the flow work for the 474 colleges
 * with no curriculum: `regulation`, `semester` and `subjects` are simply not
 * reachable there.
 */
export function nextStepFor(
  context: ResolvedStudentContext,
  personalComplete: boolean
): OnboardingStep {
  if (!personalComplete) return "personal";
  if (!context.state) return "state";
  if (!context.college) return "institution";
  if (!context.program) return "course";

  // A college with a single-branch programme still needs the branch recorded,
  // but only if the programme has one at all.
  if (!context.branch) return "branch";
  if (context.admissionYear === null) return "batch";

  if (context.hasCurriculum) {
    if (!context.regulation) return "regulation";
    if (context.currentSemester === null) return "semester";
    if (!context.subjects.length) return "subjects";
  } else if (context.currentYear === null) {
    // No curriculum means no semester step, so the year is asked for directly.
    return "semester";
  }

  return "review";
}

/**
 * Save whatever the student has chosen so far.
 *
 * `partial: true` is the autosave path — it validates and stores but does not
 * require the profile to be finishable. `partial: false` is the final submit and
 * refuses to mark anything complete that the server cannot verify.
 */
export async function saveAcademicSelection(
  userId: string,
  selection: AcademicSelection,
  options: { partial: boolean }
): Promise<SaveResult> {
  await connectDB();

  // §30: every relationship is verified before anything is written.
  const resolution = await resolveStudentContext(selection);
  if (!resolution.ok) {
    return {
      ok: false,
      field: resolution.failure.field,
      code: resolution.failure.code,
      message: resolution.failure.message,
    };
  }

  const context = resolution.context;

  const user = await User.findById(userId).select("name").lean();
  const personalComplete = Boolean(user?.name?.trim());

  const complete = isAcademicallyComplete(context) && personalComplete;

  if (!options.partial && !complete) {
    const step = nextStepFor(context, personalComplete);
    return {
      ok: false,
      field: step,
      code: "incomplete",
      message: "Some required information is still missing.",
    };
  }

  /**
   * The legacy free-text fields are kept in step with the resolved ids.
   *
   * `collegeName`, `degree` and `specialization` are required on the schema and
   * are read by the existing dashboard, so they are written from the resolved
   * context rather than left behind. Every profile written before this module
   * stays valid, and every profile written after satisfies both readers.
   */
  const degree = normaliseDegree(context.program?.degree);

  const patch: Record<string, unknown> = {
    stateId: context.state ? new Types.ObjectId(context.state.id) : null,
    stateName: context.state?.name ?? null,

    collegeId: context.college ? new Types.ObjectId(context.college.id) : null,
    collegeName: context.college?.name ?? undefined,
    institutionType: context.college?.institutionType ?? null,
    autonomyStatus: context.college?.autonomyStatus ?? null,

    universityId: context.university ? new Types.ObjectId(context.university.id) : null,
    universityName: context.university?.name ?? null,

    programId: context.program ? new Types.ObjectId(context.program.id) : null,
    programName: context.program?.name ?? null,

    branchId: context.branch ? new Types.ObjectId(context.branch.id) : null,
    branchName: context.branch?.name ?? null,

    regulationId: context.regulation ? new Types.ObjectId(context.regulation.id) : null,
    regulationCode: context.regulation?.code ?? null,

    admissionYear: context.admissionYear,
    admissionType: context.admissionType,
    currentYear: context.currentYear,
    currentSemester: context.currentSemester,
    subjectIds: context.subjects.map((subject) => new Types.ObjectId(subject.id)),

    onboardingStep: nextStepFor(context, personalComplete),
    profileCompleted: complete,
  };

  if (degree) patch.degree = degree;
  if (context.branch) patch.specialization = context.branch.name;

  /**
   * The graduation year the student supplied wins over the derived one (§46).
   *
   * A transfer or a repeated year makes the arithmetic wrong, and the student
   * knows better than the formula. The derived value is only a default.
   */
  const graduationYear =
    typeof selection.graduationYear === "number" && Number.isInteger(selection.graduationYear)
      ? selection.graduationYear
      : context.expectedGraduationYear;

  if (graduationYear) patch.graduationYear = graduationYear;

  // The schema requires `collegeName`, `degree`, `specialization` and
  // `graduationYear`, so an insert can only happen once those are known. Before
  // that, an autosave has nothing valid to create and is skipped rather than
  // failing — the selections are still in the URL-free client state.
  const canInsert =
    Boolean(patch.collegeName) && Boolean(patch.degree) && Boolean(patch.specialization) && Boolean(graduationYear);

  const existing = await StudentProfile.findOne({ userId }).select("_id").lean();

  if (!existing && !canInsert) {
    return { ok: true, context, completed: false, nextStep: nextStepFor(context, personalComplete) };
  }

  await StudentProfile.findOneAndUpdate(
    { userId },
    { $set: patch, $setOnInsert: { userId: new Types.ObjectId(userId) } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  );

  return { ok: true, context, completed: complete, nextStep: nextStepFor(context, personalComplete) };
}

/**
 * The onboarding degree enum is narrower than the programme degrees the college
 * directory holds, so a `B.Tech` maps cleanly while an unusual degree falls back
 * to `Other` rather than failing schema validation.
 */
function normaliseDegree(degree: string | undefined): Degree | null {
  if (!degree) return null;
  const match = DEGREES.find((entry) => entry.toLowerCase() === degree.toLowerCase());
  if (match) return match;
  return DEGREES.includes("Other" as Degree) ? ("Other" as Degree) : null;
}

/**
 * Record a request for a missing college (spec §36).
 *
 * Deduplicated three ways: against the student's own pending requests (the
 * partial unique index), against colleges that already exist under a different
 * spelling, and by counting repeats from different students onto one row so the
 * admin queue shows demand rather than noise.
 */
export type CollegeRequestResult =
  | { ok: true; status: "created" | "already-pending" | "already-exists"; message: string; collegeId?: string }
  | { ok: false; message: string };

export async function requestCollege(
  userId: string,
  input: { collegeName: string; stateId: string; city?: string; district?: string; website?: string; universityHint?: string }
): Promise<CollegeRequestResult> {
  await connectDB();

  const collegeName = input.collegeName.trim();
  if (collegeName.length < 4) {
    return { ok: false, message: "Enter the full name of your college." };
  }

  const stateId = Types.ObjectId.isValid(input.stateId) ? new Types.ObjectId(input.stateId) : null;
  if (!stateId) return { ok: false, message: "Select your state." };

  const state = await State.findById(stateId).select("name").lean();
  if (!state) return { ok: false, message: "Select your state." };

  const normalizedName = normalizeCollegeRequestName(collegeName);

  /**
   * Check the directory first.
   *
   * A student who cannot find their college has usually searched for a different
   * spelling, so pointing them at the existing row is more useful than filing a
   * request an administrator will close as a duplicate.
   */
  const candidates = await College.find({ stateId, status: "active" })
    .select("name")
    .limit(2000)
    .lean();

  const existing = candidates.find(
    (college) => normalizeCollegeRequestName(college.name) === normalizedName
  );
  if (existing) {
    return {
      ok: true,
      status: "already-exists",
      collegeId: String(existing._id),
      message: `${existing.name} is already listed — search for it and select it.`,
    };
  }

  const user = await User.findById(userId).select("name email").lean();

  try {
    await CollegeRequest.create({
      userId: new Types.ObjectId(userId),
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      collegeName,
      normalizedName,
      stateId,
      stateName: state.name,
      city: input.city?.trim() || null,
      district: input.district?.trim() || null,
      website: input.website?.trim() || null,
      universityHint: input.universityHint?.trim() || null,
      status: "pending",
    });
  } catch (err) {
    // The partial unique index rejected a second pending request for the same
    // institution from this student. That is the intended outcome, not an error
    // to surface as a failure.
    if (err && typeof err === "object" && (err as { code?: number }).code === 11000) {
      return {
        ok: true,
        status: "already-pending",
        message: "You have already requested this college. We will email you when it is added.",
      };
    }
    throw err;
  }

  // Count the demand on every matching row, so the queue can be worked in order
  // of how many students are blocked.
  await CollegeRequest.updateMany(
    { normalizedName, stateId, status: "pending", userId: { $ne: new Types.ObjectId(userId) } },
    { $inc: { requestCount: 1 } }
  );

  return {
    ok: true,
    status: "created",
    message: "Thanks — we will review your college and email you when it is added.",
  };
}
