/**
 * Creates every index declared on the models, then exits.
 *
 * Production runs with `autoIndex` off (see src/lib/db.ts), so this is the step
 * that puts the indexes in place: run it once after deploying a schema change,
 * before or alongside the release. It is idempotent — an index that already
 * matches is left alone.
 *
 * Run with:  npm run ensure-indexes
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { College } from "../src/models/College";
import { Course } from "../src/models/Course";
import { EmailVerificationToken } from "../src/models/EmailVerificationToken";
import { Enrollment } from "../src/models/Enrollment";
import { Lesson } from "../src/models/Lesson";
import { RateLimit } from "../src/models/RateLimit";
import { StudentProfile } from "../src/models/StudentProfile";
import { User } from "../src/models/User";

const MODELS = [
  User,
  StudentProfile,
  EmailVerificationToken,
  College,
  RateLimit,
  Course,
  Lesson,
  Enrollment,
];

async function main() {
  await connectDB();
  console.log("connected to", mongoose.connection.name);

  for (const model of MODELS) {
    // Sequential on purpose: a parallel build across every collection is a
    // spike of load on the cluster for no gain — this is a one-off task.
    await model.createIndexes();
    const indexes = await model.collection.indexes();
    console.log(`${model.modelName}: ${indexes.map((index) => index.name).join(", ")}`);
  }

  console.log("\nAll indexes are in place.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
