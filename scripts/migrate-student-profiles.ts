/**
 * Moves the embedded `users.education` sub-document into the `studentProfiles`
 * collection, and backfills `users.authProvider`.
 *
 * Needed once, on any database created before the student profile became its
 * own collection. Idempotent: a user who already has a profile row is skipped,
 * so re-running it is harmless.
 *
 * It reads the old fields through the raw driver rather than through the User
 * model, because the model no longer declares them — mongoose would strip them
 * from the result and the migration would find nothing to move.
 *
 * Run with:  npm run migrate:profiles
 * Then, once you are satisfied:  npm run migrate:profiles -- --drop-legacy
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { College, normalizeCollegeName } from "../src/models/College";
import { StudentProfile, isProfileComplete } from "../src/models/StudentProfile";
import { DEGREES, type Degree } from "../src/lib/user-fields";

/** The shape the old User schema wrote. */
type LegacyUser = {
  _id: mongoose.Types.ObjectId;
  email: string;
  googleId?: string | null;
  education?: { college?: string; program?: string; currentYear?: number } | null;
  onboardingCompletedAt?: Date | null;
};

/**
 * A graduation year is not in the old data, so it has to be inferred: current
 * year N of a course that ends in year D graduates in `thisYear + (D - N)`.
 * Four years is the common case and the safest guess; the student can correct
 * it from their profile, and `profileCompleted` stays honest either way.
 */
const ASSUMED_COURSE_YEARS = 4;

async function main() {
  const dropLegacy = process.argv.includes("--drop-legacy");

  await connectDB();
  console.log("connected to", mongoose.connection.name);

  const users = mongoose.connection.collection<LegacyUser>("users");

  const legacy = await users
    .find({ education: { $exists: true, $ne: null } })
    .project<LegacyUser>({ email: 1, googleId: 1, education: 1, onboardingCompletedAt: 1 })
    .toArray();

  console.log(`found ${legacy.length} user(s) with embedded education details`);

  let created = 0;
  let skipped = 0;

  for (const user of legacy) {
    const education = user.education;
    if (!education?.college || !education.program) {
      console.warn(`  skipping ${user.email}: incomplete education sub-document`);
      skipped += 1;
      continue;
    }

    const existing = await StudentProfile.findOne({ userId: user._id }).lean();
    if (existing) {
      skipped += 1;
      continue;
    }

    const collegeId = await ensureCollege(education.college);
    const currentYear = education.currentYear ?? null;
    const graduationYear =
      new Date().getFullYear() +
      Math.max(0, ASSUMED_COURSE_YEARS - (currentYear ?? ASSUMED_COURSE_YEARS));

    // Every value the old `program` enum allowed is still a valid degree, but
    // the field is a bare string on disk — check rather than assume, so a hand-
    // edited row lands on "Other" instead of failing schema validation.
    const degree: Degree = (DEGREES as readonly string[]).includes(education.program)
      ? (education.program as Degree)
      : "Other";

    const profile = {
      collegeId,
      collegeName: education.college,
      degree,
      // The old form never asked. Left as a placeholder the student is prompted
      // to correct, rather than invented.
      specialization: "Not specified",
      studyStatus: "studying" as const,
      currentYear,
      graduationYear,
    };

    await StudentProfile.create({
      userId: user._id,
      ...profile,
      // Respect what the old flag recorded: an account that finished the old
      // onboarding should not be sent back through the new one, even though
      // the specialization is a placeholder.
      profileCompleted: Boolean(user.onboardingCompletedAt) && isProfileComplete(profile),
    });

    created += 1;
  }

  console.log(`studentProfiles: ${created} created, ${skipped} skipped`);

  // Every account predating the change signed in with one of the two methods;
  // the presence of a googleId is what tells them apart.
  const google = await users.updateMany(
    { authProvider: { $exists: false }, googleId: { $type: "string" } },
    { $set: { authProvider: "google" } }
  );
  const email = await users.updateMany(
    { authProvider: { $exists: false } },
    { $set: { authProvider: "email" } }
  );
  console.log(
    `authProvider: ${google.modifiedCount} set to "google", ${email.modifiedCount} to "email"`
  );

  if (dropLegacy) {
    const cleared = await users.updateMany(
      { $or: [{ education: { $exists: true } }, { onboardingCompletedAt: { $exists: true } }] },
      { $unset: { education: "", onboardingCompletedAt: "" } }
    );
    console.log(`legacy fields removed from ${cleared.modifiedCount} user(s)`);
  } else {
    console.log(
      "\nLegacy `education` and `onboardingCompletedAt` fields were left in place.\n" +
        "Re-run with --drop-legacy once you have checked the migrated profiles."
    );
  }

  await mongoose.disconnect();
}

/** Finds or adds the directory entry for a college named in the old data. */
async function ensureCollege(name: string): Promise<mongoose.Types.ObjectId | null> {
  const normalizedName = normalizeCollegeName(name);
  if (!normalizedName) return null;

  const existing = await College.findOne({ normalizedName }).select("_id").lean();
  if (existing) return existing._id;

  // "student" rather than "admin": these names came from the old onboarding
  // form, so they belong in the Data Quality review queue like any other
  // student-entered college.
  const created = await College.create({ name, normalizedName, source: "student" });
  return created._id;
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
