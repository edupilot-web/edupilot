import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { StudentProfile } from "@/models/StudentProfile";
import { StudentSemesterSubjects } from "@/models/StudentSemester";
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
 * What each field invalidates when it changes.
 *
 * The academic selection is a chain — a subject belongs to a regulation, which
 * belongs to a programme at a college — so moving a link breaks everything below
 * it. Changing the college and keeping the old branch would leave a profile that
 * resolves to nothing, and `resolveStudentContext` would reject the whole save
 * with an error about a branch the caller never mentioned.
 *
 * Clearing the downstream fields instead means a partial update degrades to
 * "you are at a new college, tell us your course" rather than failing.
 *
 * `admissionYear` is deliberately absent: it changes the *derived* year and
 * semester, but those are recomputed from it on every resolve anyway, and an
 * explicit semester override is a deliberate correction that a batch edit should
 * not silently discard.
 */
const DEPENDENTS: Partial<Record<keyof AcademicSelection, (keyof AcademicSelection)[]>> = {
  stateId: ["collegeId", "universityId", "programId", "branchId", "regulationId", "subjectIds"],
  collegeId: ["universityId", "programId", "branchId", "regulationId", "subjectIds"],
  programId: ["branchId", "regulationId", "subjectIds"],
  branchId: ["regulationId", "subjectIds"],
  regulationId: ["subjectIds"],
  currentSemester: ["subjectIds"],
};

const SELECTION_KEYS = [
  "stateId",
  "collegeId",
  "universityId",
  "programId",
  "branchId",
  "regulationId",
  "admissionYear",
  "admissionType",
  "currentYear",
  "currentSemester",
  "graduationYear",
  "subjectIds",
] as const satisfies readonly (keyof AcademicSelection)[];

/**
 * The stored profile, read back as a selection.
 *
 * Exported because the profile screen resolves the same way the flow does:
 * read what is stored, hand it to the resolver, render what comes back. Reading
 * the denormalised `collegeName`/`branchName` fields instead would show a
 * student a name that no longer matches the id underneath it.
 */
export async function storedSelection(userId: string): Promise<AcademicSelection> {
  const profile = await StudentProfile.findOne({ userId })
    .select(
      "stateId collegeId universityId programId branchId regulationId admissionYear admissionType currentYear currentSemester graduationYear subjectIds"
    )
    .lean();

  if (!profile) return {};

  const id = (value: unknown): string | null => (value ? String(value) : null);

  return {
    stateId: id(profile.stateId),
    collegeId: id(profile.collegeId),
    universityId: id(profile.universityId),
    programId: id(profile.programId),
    branchId: id(profile.branchId),
    regulationId: id(profile.regulationId),
    admissionYear: profile.admissionYear ?? null,
    admissionType: profile.admissionType ?? null,
    currentYear: profile.currentYear ?? null,
    currentSemester: profile.currentSemester ?? null,
    graduationYear: profile.graduationYear ?? null,
    subjectIds: (profile.subjectIds ?? []).map((value) => String(value)),
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a.map(String) : [];
    const right = Array.isArray(b) ? b.map(String) : [];
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
  }
  return (a ?? null) === (b ?? null);
}

/**
 * Lay an incoming selection over the stored one.
 *
 * A key the caller did not send keeps its stored value; a key sent as `null`
 * clears it. That is the difference between a partial update and a replace, and
 * without it a `PATCH {"currentSemester": 5}` emptied the student's entire
 * academic profile — every unsent field resolved to nothing and was written as
 * such, dropping them back into onboarding with their college gone.
 *
 * Exported for the tests, which is the only place the merge can be checked in
 * isolation from the resolver and the database.
 */
export function mergeSelection(
  stored: AcademicSelection,
  incoming: AcademicSelection
): AcademicSelection {
  const merged: Record<string, unknown> = { ...stored };
  const supplied = SELECTION_KEYS.filter((key) => key in incoming);

  for (const key of supplied) {
    merged[key] = incoming[key];
  }

  // Then drop whatever sits downstream of a field that actually moved — unless
  // the caller supplied that field too, in which case they have already said
  // what it should be.
  for (const key of supplied) {
    if (sameValue(stored[key], incoming[key])) continue;
    for (const dependent of DEPENDENTS[key] ?? []) {
      if (supplied.includes(dependent)) continue;

      // Nothing to invalidate. Worth skipping rather than writing `null` over
      // an absent key: the merged selection is what the resolver reports
      // failures against, and a field nobody ever set should stay absent.
      const current = merged[dependent];
      if (current === null || current === undefined) continue;
      if (Array.isArray(current) && current.length === 0) continue;

      merged[dependent] = dependent === "subjectIds" ? [] : null;
    }
  }

  return merged as AcademicSelection;
}

/**
 * Save whatever the student has chosen so far.
 *
 * `partial: true` is the autosave path — it validates and stores but does not
 * require the profile to be finishable. `partial: false` is the final submit and
 * refuses to mark anything complete that the server cannot verify.
 *
 * Either way the write is a **merge** over what is already stored, not a
 * replace. The patch below sets every field from the resolved context, so
 * anything missing from `incoming` has to be filled in from the profile first or
 * it is written away — see `mergeSelection`.
 */
export async function saveAcademicSelection(
  userId: string,
  incoming: AcademicSelection,
  options: { partial: boolean }
): Promise<SaveResult> {
  await connectDB();

  const selection = mergeSelection(await storedSelection(userId), incoming);

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

  const profile = await StudentProfile.findOneAndUpdate(
    { userId },
    { $set: patch, $setOnInsert: { userId: new Types.ObjectId(userId) } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  );

  await recordSemester(userId, profile?._id, context, { confirmed: !options.partial });

  return { ok: true, context, completed: complete, nextStep: nextStepFor(context, personalComplete) };
}

/**
 * Record what this student is taking, this semester.
 *
 * `StudentProfile.subjectIds` is one flat array with no semester on it, so
 * recording the fourth semester overwrites the third — and with it the only
 * record of what the student actually took. `StudentSemesterSubjects` is the
 * per-semester row that exists to keep that history, and until now **nothing in
 * the application wrote it**: a seed script was its only author, so
 * `subjectsConfirmed` was false for every real student and `/curriculum` told
 * someone who had just chosen their semester and subjects that it had guessed
 * them.

 * The profile field stays as the current-semester cache, so every existing read
 * keeps working and this is an addition rather than a migration.
 *
 * `confirmedAt` is set only on a **submit**, never on an autosave. An autosave
 * is the flow passing through a step, not the student agreeing to what is on
 * it, and treating the two the same would mark a list confirmed that nobody has
 * looked at. Once set it is not cleared by a later autosave, because a
 * confirmation is a thing that happened.
 */
async function recordSemester(
  userId: string,
  profileId: Types.ObjectId | undefined,
  context: ResolvedStudentContext,
  options: { confirmed: boolean }
): Promise<void> {
  // A semester is what the row is keyed by, and subjects are what it is for.
  if (!profileId || context.currentSemester === null || !context.subjects.length) return;

  const now = new Date();

  await StudentSemesterSubjects.findOneAndUpdate(
    { studentProfileId: profileId, semester: context.currentSemester },
    {
      $set: {
        userId: new Types.ObjectId(userId),
        year: context.currentYear ?? Math.ceil(context.currentSemester / 2),
        regulationId: context.regulation ? new Types.ObjectId(context.regulation.id) : null,
        subjectIds: context.subjects.map((subject) => new Types.ObjectId(subject.id)),
        source: "student-selected",
      },
      // `$setOnInsert` would lose a confirmation that arrives on a later
      // submit, so the flag is set on its own and never unset.
      ...(options.confirmed ? { $max: { confirmedAt: now } } : {}),
      $setOnInsert: { studentProfileId: profileId, semester: context.currentSemester },
    },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
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
