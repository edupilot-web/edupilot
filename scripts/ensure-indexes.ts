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
import { Bookmark, LearningEvent, StudentTopicProgress } from "../src/models/Learning";
import { Subtopic, Topic, TopicContent } from "../src/models/Topic";
import { TeacherAcademicAssignment, TeacherProfile } from "../src/models/Teacher";
import {
  Assignment,
  AssignmentStudent,
  AssignmentSubmission,
} from "../src/models/Assignment";
import { Note, NoteBookmark, NoteRecipient, NoteView } from "../src/models/Note";
import { Notification, NotificationPreference } from "../src/models/Notification";
import { StoredFile } from "../src/models/StoredFile";
import {
  AiAnswerCache,
  AiConversation,
  AiInteraction,
  AiUsageDaily,
} from "../src/models/Tutor";
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
  // Learning: topics, prepared content, progress and the AI tutor.
  // `LearningEvent` and `AiAnswerCache` carry TTL indexes, which mongo only
  // creates from a declaration — without this list their documents accumulate
  // forever in production and nothing reports that they are doing so.
  Topic,
  Subtopic,
  TopicContent,
  StudentTopicProgress,
  LearningEvent,
  Bookmark,
  AiConversation,
  AiInteraction,
  AiAnswerCache,
  AiUsageDaily,
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
  /**
   * Teaching: teachers, the work they set, the notes they share, the files
   * attached to both, and the notifications that go out.
   *
   * Two of these carry indexes that are not merely an optimisation.
   * `Notification` has a TTL index, which mongo only creates from a
   * declaration — without it the collection grows forever and nothing reports
   * that it is doing so. It also has the unique index that makes §63's
   * deduplication a *guarantee* rather than a hope, so a deployment missing it
   * would double-notify on every retried fan-out, silently.
   */
  TeacherProfile,
  TeacherAcademicAssignment,
  Assignment,
  AssignmentStudent,
  AssignmentSubmission,
  Note,
  NoteRecipient,
  NoteView,
  NoteBookmark,
  Notification,
  NotificationPreference,
  StoredFile,
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
