import "./test-db";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../../src/lib/db";
import { User } from "../../src/models/User";
import { Assignment, AssignmentStudent } from "../../src/models/Assignment";
import { getTeacherDashboard } from "../../src/lib/teaching/teacher-view";
import type { TeacherContext } from "../../src/lib/teaching/teacher";

/**
 * The teacher dashboard's "recent submissions" panel.
 *
 * It used to fetch the forty most recent submissions **across the whole
 * platform** and narrow them to this teacher afterwards. Correct on an empty
 * database and wrong on a real one: with any other teacher active, this
 * teacher's rows fall outside the global forty and the panel reads "Nothing
 * handed in yet" while their students are handing work in.
 *
 * That is a defect only a populated database shows, which is why it is tested
 * here and not with a unit test — the bug was invisible in every environment
 * small enough to develop against.
 */

let teacher: TeacherContext;
let collegeId: Types.ObjectId;
let assignmentId: Types.ObjectId;
let studentId: Types.ObjectId;

before(async () => {
  await connectDB();

  collegeId = new Types.ObjectId();
  const teacherUser = await User.create({
    name: "Dashboard Teacher",
    email: `dash-${Date.now()}@test.local`,
    passwordHash: "x".repeat(60),
    role: "teacher",
    emailVerified: true,
  });
  const student = await User.create({
    name: "Dashboard Student",
    email: `dash-s-${Date.now()}@test.local`,
    passwordHash: "x".repeat(60),
    role: "student",
    emailVerified: true,
  });
  studentId = student._id;

  teacher = {
    userId: String(teacherUser._id),
    teacherProfileId: String(new Types.ObjectId()),
    collegeId: String(collegeId),
    collegeName: "Test College",
    status: "active",
    canPublish: true,
    name: teacherUser.name,
    email: teacherUser.email,
    emailVerified: true,
  } as TeacherContext;

  const assignment = await Assignment.create({
    teacherId: new Types.ObjectId(),
    teacherUserId: teacherUser._id,
    collegeId,
    programId: new Types.ObjectId(),
    branchId: new Types.ObjectId(),
    regulationId: new Types.ObjectId(),
    subjectId: new Types.ObjectId(),
    year: 2,
    semester: 3,
    title: "Ours",
    status: "published",
    submissionType: "text",
    assignedCount: 1,
    submittedCount: 1,
  });
  assignmentId = assignment._id;

  await AssignmentStudent.create({
    assignmentId,
    studentId,
    subjectId: assignment.subjectId,
    collegeId,
    status: "submitted",
    submittedAt: new Date(Date.now() - 60 * 60_000),
  });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/** Submissions belonging to other teachers, newer than ours. */
async function addForeignSubmissions(count: number): Promise<void> {
  await AssignmentStudent.insertMany(
    Array.from({ length: count }, (_, index) => ({
      assignmentId: new Types.ObjectId(),
      studentId: new Types.ObjectId(),
      subjectId: new Types.ObjectId(),
      collegeId: new Types.ObjectId(),
      status: "submitted",
      submittedAt: new Date(Date.now() + (index + 1) * 60_000),
    })),
    { ordered: false }
  );
}

describe("recent submissions", () => {
  it("shows this teacher's submission", async () => {
    const dashboard = await getTeacherDashboard(teacher, []);
    assert.equal(dashboard.recentSubmissions.length, 1);
    assert.equal(dashboard.recentSubmissions[0].assignmentTitle, "Ours");
  });

  /** The regression. */
  it("still shows it when other teachers are busier", async () => {
    await addForeignSubmissions(60);

    const dashboard = await getTeacherDashboard(teacher, []);
    assert.equal(
      dashboard.recentSubmissions.length,
      1,
      "a platform-wide limit would have pushed this teacher's row out"
    );
    assert.equal(dashboard.recentSubmissions[0].assignmentTitle, "Ours");
  });

  it("never shows another teacher's submission", async () => {
    const dashboard = await getTeacherDashboard(teacher, []);
    for (const row of dashboard.recentSubmissions) {
      assert.equal(row.assignmentTitle, "Ours");
    }
  });

  /**
   * The panel is recent activity, not a queue.
   *
   * Marking a submission should not erase the fact that it arrived — and "how
   * many are waiting" is already its own figure elsewhere on the screen.
   */
  it("keeps a submission after it has been graded", async () => {
    await AssignmentStudent.updateOne(
      { assignmentId, studentId },
      { $set: { status: "graded", marks: 18 } }
    );

    const dashboard = await getTeacherDashboard(teacher, []);
    assert.equal(dashboard.recentSubmissions.length, 1);
    assert.equal(dashboard.recentSubmissions[0].assignmentTitle, "Ours");
  });

  it("returns nothing for a teacher with no assignments", async () => {
    const stranger = { ...teacher, userId: String(new Types.ObjectId()) } as TeacherContext;
    const dashboard = await getTeacherDashboard(stranger, []);
    assert.equal(dashboard.recentSubmissions.length, 0);
  });
});
