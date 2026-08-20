/**
 * Seeds the database with a demo instructor, student, course and lessons.
 * Run with:  npm run seed
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { User } from "../src/models/User";
import { Course } from "../src/models/Course";
import { Lesson } from "../src/models/Lesson";
import { Enrollment } from "../src/models/Enrollment";

async function main() {
  await connectDB();
  console.log("connected to", mongoose.connection.name);

  await Promise.all([
    User.deleteMany({}),
    Course.deleteMany({}),
    Lesson.deleteMany({}),
    Enrollment.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash("password123", 12);

  // Onboarding is marked complete so the demo accounts land on the dashboard
  // rather than being sent through the profile/education steps.
  const onboarded = { onboardingCompletedAt: new Date(), emailVerified: true };

  const [instructor, student] = await User.create([
    {
      name: "Ada Lovelace",
      email: "ada@edupilot.dev",
      passwordHash,
      role: "instructor",
      city: "Cambridge",
      ...onboarded,
      education: { college: "University of Cambridge", program: "PhD", currentYear: 2 },
    },
    {
      name: "Sam Student",
      email: "sam@edupilot.dev",
      passwordHash,
      role: "student",
      city: "Pune",
      ...onboarded,
      education: { college: "Savitribai Phule Pune University", program: "B.Tech", currentYear: 3 },
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
