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
import { AcademicYear, Campus, Department, Program } from "../src/models/AcademicStructure";
import { Affiliation } from "../src/models/Affiliation";
import { AdminLoginEvent, AdminUser } from "../src/models/AdminUser";
import { AuditLog } from "../src/models/AuditLog";
import { AutonomyRecord } from "../src/models/AutonomyRecord";
import { City, District, State } from "../src/models/Geo";
import { College } from "../src/models/College";
import { Course } from "../src/models/Course";
import { EmailVerificationToken } from "../src/models/EmailVerificationToken";
import { Enrollment } from "../src/models/Enrollment";
import { ImportJob, ImportRow } from "../src/models/ImportJob";
import { Lesson } from "../src/models/Lesson";
import { RateLimit } from "../src/models/RateLimit";
import { Role } from "../src/models/Role";
import { StudentProfile } from "../src/models/StudentProfile";
import {
  BackgroundJob,
  ErrorLog,
  ExportJob,
  FeatureFlag,
  SavedView,
  Setting,
} from "../src/models/SystemModels";
import { University } from "../src/models/University";
import { User } from "../src/models/User";

/**
 * Every model with a declared index.
 *
 * A model missing from this list keeps working and silently runs unindexed in
 * production, which is the failure mode this script exists to prevent — so
 * adding a model means adding it here.
 */
const MODELS = [
  // Student side
  User,
  StudentProfile,
  EmailVerificationToken,
  RateLimit,
  Course,
  Lesson,
  Enrollment,
  // Institution master data
  State,
  District,
  City,
  University,
  College,
  Affiliation,
  AutonomyRecord,
  Campus,
  Department,
  Program,
  AcademicYear,
  // Administration
  AdminUser,
  AdminLoginEvent,
  Role,
  AuditLog,
  SavedView,
  // Operations
  ImportJob,
  ImportRow,
  ExportJob,
  BackgroundJob,
  ErrorLog,
  FeatureFlag,
  Setting,
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
