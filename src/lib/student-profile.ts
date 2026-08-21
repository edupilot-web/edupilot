import type { HydratedDocument } from "mongoose";
import { connectDB } from "@/lib/db";
import { College, normalizeCollegeName } from "@/models/College";
import {
  StudentProfile,
  isProfileComplete,
  type StudentProfileDoc,
} from "@/models/StudentProfile";
import type { Degree, StudyStatus } from "@/lib/user-fields";

export type StudentProfileDocument = HydratedDocument<StudentProfileDoc>;

/** What the app reads: plain data, ids already stringified. */
export type StudentProfileView = {
  collegeId: string | null;
  collegeName: string;
  degree: string;
  specialization: string;
  studyStatus: StudyStatus;
  currentYear: number | null;
  graduationYear: number;
  profileCompleted: boolean;
};

export async function getStudentProfile(userId: string): Promise<StudentProfileView | null> {
  await connectDB();
  const profile = await StudentProfile.findOne({ userId }).lean();
  return profile ? toView(profile) : null;
}

export function toView(profile: StudentProfileDoc): StudentProfileView {
  return {
    collegeId: profile.collegeId ? String(profile.collegeId) : null,
    collegeName: profile.collegeName,
    degree: profile.degree,
    specialization: profile.specialization,
    studyStatus: profile.studyStatus as StudyStatus,
    currentYear: profile.currentYear ?? null,
    graduationYear: profile.graduationYear,
    profileCompleted: profile.profileCompleted,
  };
}

export type EducationStepInput = {
  /** Id of a matched directory entry, or null when the name was typed in. */
  collegeId: string | null;
  collegeName: string;
  degree: Degree;
  specialization: string;
};

export type AcademicStepInput = {
  studyStatus: StudyStatus;
  currentYear: number | null;
  graduationYear: number;
};

/**
 * Saves onboarding step 1.
 *
 * Upsert rather than create: a student who backs out after step 1 and returns
 * later must land on their own half-filled profile, not a duplicate — and
 * `userId` is unique, so a second insert would fail outright.
 *
 * `profileCompleted` is recomputed from the merged document on every write, so
 * the flag is never asserted by the caller and cannot drift from the fields.
 */
export async function saveEducationStep(
  userId: string,
  input: EducationStepInput
): Promise<StudentProfileView> {
  await connectDB();

  const collegeId = await resolveCollege(input);

  const existing = await StudentProfile.findOne({ userId }).lean();
  const merged = {
    collegeName: input.collegeName,
    degree: input.degree,
    specialization: input.specialization,
    studyStatus: existing?.studyStatus ?? "studying",
    currentYear: existing?.currentYear ?? null,
    graduationYear: existing?.graduationYear ?? null,
  };

  const saved = await StudentProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        collegeId,
        collegeName: input.collegeName,
        degree: input.degree,
        specialization: input.specialization,
        profileCompleted: isProfileComplete(merged),
      },
      $setOnInsert: { userId },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  // `upsert` with `returnDocument: "after"` always yields a document.
  return toView(saved as StudentProfileDoc);
}

/**
 * Saves onboarding step 2. Requires step 1 to have run, because the completion
 * flag is computed from both halves and there is nothing to merge into
 * otherwise.
 */
export async function saveAcademicStep(
  userId: string,
  input: AcademicStepInput
): Promise<StudentProfileView | null> {
  await connectDB();

  const existing = await StudentProfile.findOne({ userId }).lean();
  if (!existing) return null;

  // A graduate has no current year. Clearing it here rather than trusting the
  // form means switching back from "Graduated" cannot leave a stale value.
  const currentYear = input.studyStatus === "graduated" ? null : input.currentYear;

  const merged = {
    collegeName: existing.collegeName,
    degree: existing.degree,
    specialization: existing.specialization,
    studyStatus: input.studyStatus,
    currentYear,
    graduationYear: input.graduationYear,
  };

  const saved = await StudentProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        studyStatus: input.studyStatus,
        currentYear,
        graduationYear: input.graduationYear,
        profileCompleted: isProfileComplete(merged),
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();

  return saved ? toView(saved) : null;
}

/**
 * Turns whatever the college field submitted into a directory id.
 *
 * The submitted id is re-read rather than trusted, and only accepted when it
 * still carries the name the form displayed — otherwise a tampered submission
 * could attach an arbitrary label to a real college. A name with no match is
 * added to the directory as `source: "user"`, so the next student searching
 * for it finds it already there.
 */
async function resolveCollege(
  input: EducationStepInput
): Promise<StudentProfileDoc["collegeId"]> {
  if (input.collegeId) {
    const known = await College.findById(input.collegeId).select("_id name").lean();
    if (known && known.name === input.collegeName) return known._id;
  }

  const normalizedName = normalizeCollegeName(input.collegeName);
  if (!normalizedName) return null;

  const byName = await College.findOne({ normalizedName }).select("_id").lean();
  if (byName) return byName._id;

  try {
    const created = await College.create({
      name: input.collegeName,
      normalizedName,
      source: "user",
    });
    return created._id;
  } catch (err) {
    // Two students adding the same missing college at once: one insert wins the
    // unique index, and the loser reads the winner's row.
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      const raced = await College.findOne({ normalizedName }).select("_id").lean();
      return raced?._id ?? null;
    }
    // The profile is worth more than the directory entry. Keep the typed name.
    console.error("[onboarding] could not add the college to the directory:", err);
    return null;
  }
}

/**
 * Whether onboarding is finished, without pulling the whole profile back.
 *
 * Used by the sign-in paths, which need the answer to pick a destination but
 * have no use for the fields themselves.
 */
export async function isProfileCompleted(userId: string): Promise<boolean> {
  await connectDB();
  const profile = await StudentProfile.findOne({ userId })
    .select("profileCompleted")
    .lean();
  return profile?.profileCompleted === true;
}
