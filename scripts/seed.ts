/**
 * Seeds the database with a demo instructor, student, course and lessons.
 * Run with:  npm run seed
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { User } from "../src/models/User";
import { StudentProfile } from "../src/models/StudentProfile";
import { EmailVerificationToken } from "../src/models/EmailVerificationToken";
import { College, normalizeCollegeName } from "../src/models/College";
import { Course } from "../src/models/Course";
import { Lesson } from "../src/models/Lesson";
import { Enrollment } from "../src/models/Enrollment";

async function main() {
  await connectDB();
  console.log("connected to", mongoose.connection.name);

  await Promise.all([
    User.deleteMany({}),
    StudentProfile.deleteMany({}),
    EmailVerificationToken.deleteMany({}),
    Course.deleteMany({}),
    Lesson.deleteMany({}),
    Enrollment.deleteMany({}),
  ]);
  // The college directory is left alone: it is seeded separately
  // (`npm run seed:colleges`) and is shared reference data, not demo content.

  const passwordHash = await bcrypt.hash("password123", 12);

  // Verified, so the demo accounts are not held at the "check your email"
  // screen with no mail server running.
  const [instructor, student] = await User.create([
    {
      name: "Ada Lovelace",
      email: "ada@edupilot.dev",
      passwordHash,
      role: "instructor",
      authProvider: "email",
      emailVerified: true,
      city: "Cambridge",
    },
    {
      name: "Sam Student",
      email: "sam@edupilot.dev",
      passwordHash,
      role: "student",
      authProvider: "email",
      emailVerified: true,
      city: "Pune",
    },
  ]);

  // Completed profiles, so both land on the dashboard rather than in onboarding.
  await StudentProfile.create([
    {
      userId: instructor._id,
      collegeId: await collegeId("University of Cambridge"),
      collegeName: "University of Cambridge",
      degree: "PhD",
      specialization: "Mathematics",
      studyStatus: "graduated",
      currentYear: null,
      graduationYear: new Date().getFullYear() - 2,
      profileCompleted: true,
    },
    {
      userId: student._id,
      collegeId: await collegeId("Savitribai Phule Pune University"),
      collegeName: "Savitribai Phule Pune University",
      degree: "B.Tech",
      specialization: "Computer Science and Engineering",
      studyStatus: "studying",
      currentYear: 3,
      graduationYear: new Date().getFullYear() + 1,
      profileCompleted: true,
    },
  ]);

  const course = await Course.create({
    title: "Introduction to Algorithms",
    slug: "introduction-to-algorithms",
    description: "Sorting, searching and complexity analysis from first principles.",
    instructor: instructor._id,
    level: "beginner",
    tags: ["algorithms", "computer-science"],
    price: 0,
    published: true,
  });

  const lessons = await Lesson.create([
    { course: course._id, title: "Big-O notation", order: 0, durationMinutes: 12, isFreePreview: true, content: "How we measure growth." },
    { course: course._id, title: "Binary search", order: 1, durationMinutes: 18, content: "Halving the search space." },
    { course: course._id, title: "Merge sort", order: 2, durationMinutes: 22, content: "Divide and conquer." },
  ]);

  await Course.updateOne({ _id: course._id }, { lessonCount: lessons.length });

  await Enrollment.create({
    student: student._id,
    course: course._id,
    completedLessons: [lessons[0]._id],
    progress: Math.round((1 / lessons.length) * 100),
  });

  console.log(`seeded ${lessons.length} lessons on "${course.title}"`);
  console.log("login with ada@edupilot.dev / sam@edupilot.dev — password: password123");
  await mongoose.disconnect();
}

/** Links the demo profiles to the directory, adding the college if it is absent. */
async function collegeId(name: string) {
  const normalizedName = normalizeCollegeName(name);
  const existing = await College.findOne({ normalizedName }).select("_id").lean();
  if (existing) return existing._id;
  const created = await College.create({ name, normalizedName, source: "seed" });
  return created._id;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
