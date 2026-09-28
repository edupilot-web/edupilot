import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";

/**
 * Must be the first import that reaches mongoose: it redirects the whole
 * process at a throwaway database.
 */
import { TEST_DB } from "./test-db";

import { connectDB } from "../../src/lib/db";
import { CurriculumSubject, Regulation } from "../../src/models/Curriculum";
import { StudentProfile } from "../../src/models/StudentProfile";
import { User } from "../../src/models/User";
import { TeacherAcademicAssignment, TeacherProfile } from "../../src/models/Teacher";
import { Assignment, AssignmentStudent } from "../../src/models/Assignment";
import { Note, NoteRecipient } from "../../src/models/Note";
import { Notification } from "../../src/models/Notification";
import { resolveAudience } from "../../src/lib/teaching/audience";
import { authorizeSubject } from "../../src/lib/teaching/teacher";
import { publishAssignment } from "../../src/lib/teaching/assignments";
import { getStudentAssignment, listStudentAssignments, getStudentNote } from "../../src/lib/teaching/student-view";
import { getSubmission, listSubmissions, submitAssignment } from "../../src/lib/teaching/submissions";
import { notify } from "../../src/lib/notifications/service";
import type { TeacherContext } from "../../src/lib/teaching/teacher";

/**
 * §94's critical security tests, plus the audience rules they depend on.
 *
 *   - A teacher at College A cannot create for College B.
 *   - A teacher assigned Data Structures cannot act on DBMS.
 *   - A student at College A cannot reach College B's assignment.
 *   - A student cannot reach another student's submission.
 *   - A teacher cannot reach another teacher's submissions.
 *
 * Written against the real services and a real database rather than mocks. A
 * mocked authorisation test asserts that the mock was called; these assert that
 * a query written with the wrong filter would actually return the wrong row —
 * which is the only version of this test that could ever fail usefully.
 *
 * **It runs against its own database** (`<db>_authtest`, see `test-db.ts`),
 * dropped before and after.
 */

const id = () => new Types.ObjectId();

// ── College A ─────────────────────────────────────────────────────────────
const collegeA = id();
const programA = id();
const branchA = id();
let regulationA: Types.ObjectId;

// ── College B ─────────────────────────────────────────────────────────────
const collegeB = id();
const programB = id();
const branchB = id();
let regulationB: Types.ObjectId;

let dataStructures: Types.ObjectId;
let dbms: Types.ObjectId;
let subjectB: Types.ObjectId;

const teacherAUser = id();
const teacherBUser = id();
const otherTeacherAUser = id();
let teacherA: TeacherContext;
let teacherB: TeacherContext;
let otherTeacherA: TeacherContext;

const studentA1 = id();
const studentA2 = id();
const studentB1 = id();
/** Same college and branch as A's students, but a year ahead (§19). */
const studentA3 = id();

before(async () => {
  await connectDB();

  assert.equal(
    mongoose.connection.name,
    TEST_DB,
    `refusing to run: connected to "${mongoose.connection.name}" instead of "${TEST_DB}"`
  );

  await mongoose.connection.dropDatabase();

  const [rA, rB] = await Promise.all([
    Regulation.create({
      collegeId: collegeA,
      code: "R23",
      name: "R23",
      effectiveFromYear: 2023,
      totalSemesters: 8,
    }),
    Regulation.create({
      collegeId: collegeB,
      code: "R23",
      name: "R23",
      effectiveFromYear: 2023,
      totalSemesters: 8,
    }),
  ]);

  regulationA = rA._id;
  regulationB = rB._id;

  const makeSubject = async (input: {
    collegeId: Types.ObjectId;
    programId: Types.ObjectId;
    branchId: Types.ObjectId;
    regulationId: Types.ObjectId;
    name: string;
    code: string;
  }) => {
    const subject = await CurriculumSubject.create({
      ...input,
      year: 2,
      semester: 3,
      programName: "B.Tech",
      branchName: "CSE",
      regulationCode: "R23",
    });
    return subject._id;
  };

  dataStructures = await makeSubject({
    collegeId: collegeA,
    programId: programA,
    branchId: branchA,
    regulationId: regulationA,
    name: "Data Structures",
    code: "CS201",
  });

  dbms = await makeSubject({
    collegeId: collegeA,
    programId: programA,
    branchId: branchA,
    regulationId: regulationA,
    name: "Database Management Systems",
    code: "CS205",
  });

  subjectB = await makeSubject({
    collegeId: collegeB,
    programId: programB,
    branchId: branchB,
    regulationId: regulationB,
    name: "Data Structures",
    code: "CSB201",
  });

  // ── Teachers ────────────────────────────────────────────────────────────
  const makeTeacher = async (
    userId: Types.ObjectId,
    collegeId: Types.ObjectId,
    name: string
  ) => {
    await User.create({
      _id: userId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.test`,
      passwordHash: "x".repeat(60),
      role: "teacher",
      emailVerified: true,
    });

    const profile = await TeacherProfile.create({
      userId,
      collegeId,
      collegeName: collegeId.equals(collegeA) ? "College A" : "College B",
      status: "active",
    });

    return {
      userId: String(userId),
      teacherProfileId: String(profile._id),
      name,
      email: "",
      emailVerified: true,
      collegeId: String(collegeId),
      collegeName: collegeId.equals(collegeA) ? "College A" : "College B",
      departmentId: null,
      departmentName: null,
      designation: null,
      employeeId: null,
      status: "active" as const,
      canPublish: true,
    };
  };

  teacherA = await makeTeacher(teacherAUser, collegeA, "Teacher A");
  teacherB = await makeTeacher(teacherBUser, collegeB, "Teacher B");
  otherTeacherA = await makeTeacher(otherTeacherAUser, collegeA, "Other Teacher A");

  const assign = (teacher: TeacherContext, subjectId: Types.ObjectId, collegeId: Types.ObjectId) =>
    TeacherAcademicAssignment.create({
      teacherId: teacher.teacherProfileId,
      userId: teacher.userId,
      collegeId,
      subjectId,
      programId: collegeId.equals(collegeA) ? programA : programB,
      branchId: collegeId.equals(collegeA) ? branchA : branchB,
      regulationId: collegeId.equals(collegeA) ? regulationA : regulationB,
      year: 2,
      semester: 3,
      subjectName: "Subject",
      subjectCode: "CODE",
      status: "active",
    });

  // Teacher A teaches Data Structures — and NOT DBMS.
  await assign(teacherA, dataStructures, collegeA);
  // Teacher B teaches their own college's subject.
  await assign(teacherB, subjectB, collegeB);
  // The other teacher at College A teaches DBMS.
  await assign(otherTeacherA, dbms, collegeA);

  // ── Students ────────────────────────────────────────────────────────────
  const makeStudent = async (
    userId: Types.ObjectId,
    collegeId: Types.ObjectId,
    admissionYear: number
  ) => {
    await User.create({
      _id: userId,
      name: `Student ${String(userId).slice(-4)}`,
      email: `${String(userId)}@example.test`,
      passwordHash: "x".repeat(60),
      role: "student",
      emailVerified: true,
    });

    await StudentProfile.create({
      userId,
      collegeId,
      collegeName: "College",
      degree: "B.Tech",
      specialization: "CSE",
      programId: collegeId.equals(collegeA) ? programA : programB,
      branchId: collegeId.equals(collegeA) ? branchA : branchB,
      regulationId: collegeId.equals(collegeA) ? regulationA : regulationB,
      admissionYear,
      /**
       * `currentSemester` is deliberately **unset**.
       *
       * It is an explicit override that outranks the admission year in
       * `resolveAcademicPosition`, so setting it here would pin every fixture
       * to semester 3 and defeat the very derivation §19 is about — the
       * third-year student would have matched a second-year audience.
       */
      graduationYear: admissionYear + 4,
      profileCompleted: true,
    });
  };

  /**
   * The admission year is what the audience resolver derives a position from,
   * so it is chosen relative to *now* rather than hard-coded: a fixture that
   * said "2024" would start failing in July.
   */
  const now = new Date();
  const academicYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

  // In their second year, first half — semester 3.
  const secondYearIntake = academicYearStart - 1;
  // A year ahead: semester 5.
  const thirdYearIntake = academicYearStart - 2;

  await makeStudent(studentA1, collegeA, secondYearIntake);
  await makeStudent(studentA2, collegeA, secondYearIntake);
  await makeStudent(studentB1, collegeB, secondYearIntake);
  await makeStudent(studentA3, collegeA, thirdYearIntake);
});

after(async () => {
  if (mongoose.connection.name === TEST_DB) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.connection.close();
});

// ── §94: college isolation ────────────────────────────────────────────────

describe("a teacher cannot reach another college", () => {
  it("authorises their own subject", async () => {
    const subject = await authorizeSubject(teacherA, String(dataStructures));
    assert.ok(subject);
    assert.equal(subject.collegeId, String(collegeA));
  });

  /**
   * §94's first test. Teacher A holds no assignment for College B's subject, so
   * there is nothing to authorise against — and even if an assignment row were
   * fabricated, the subject lookup carries the teacher's own college.
   */
  it("refuses a subject from another college", async () => {
    assert.equal(await authorizeSubject(teacherA, String(subjectB)), null);
    assert.equal(await authorizeSubject(teacherB, String(dataStructures)), null);
  });

  it("refuses even a subject that does not exist", async () => {
    assert.equal(await authorizeSubject(teacherA, String(new Types.ObjectId())), null);
    assert.equal(await authorizeSubject(teacherA, "not-an-id"), null);
  });
});

// ── §94: subject authorisation inside one college ─────────────────────────

describe("a teacher cannot reach a subject they are not assigned", () => {
  /**
   * §94's second test, and the one that shows being a teacher at a college
   * grants nothing on its own: DBMS is in the same college, the same branch and
   * the same semester as Data Structures.
   */
  it("refuses another subject in the same college", async () => {
    assert.ok(await authorizeSubject(teacherA, String(dataStructures)));
    assert.equal(await authorizeSubject(teacherA, String(dbms)), null);
  });

  it("stops being authorised once the assignment is revoked (§78)", async () => {
    await TeacherAcademicAssignment.updateOne(
      { userId: teacherA.userId, subjectId: dataStructures },
      { $set: { status: "revoked" } }
    );

    assert.equal(await authorizeSubject(teacherA, String(dataStructures)), null);

    await TeacherAcademicAssignment.updateOne(
      { userId: teacherA.userId, subjectId: dataStructures },
      { $set: { status: "active" } }
    );

    assert.ok(await authorizeSubject(teacherA, String(dataStructures)));
  });
});

// ── §18, §19: the audience ────────────────────────────────────────────────

describe("the audience resolver", () => {
  it("finds the students currently in that semester", async () => {
    const audience = await resolveAudience({
      collegeId: collegeA,
      programId: programA,
      branchId: branchA,
      regulationId: regulationA,
      semester: 3,
    });

    const ids = audience.members.map((member) => String(member.userId)).sort();
    assert.deepEqual(ids, [String(studentA1), String(studentA2)].sort());
  });

  /**
   * §19's rule, as a fact rather than a comment: a student a year ahead is no
   * longer a second-year student, and nobody updated a row to make that true.
   */
  it("excludes a student who has moved up a year", async () => {
    const audience = await resolveAudience({
      collegeId: collegeA,
      programId: programA,
      branchId: branchA,
      regulationId: regulationA,
      semester: 3,
    });

    assert.ok(
      !audience.members.some((member) => String(member.userId) === String(studentA3)),
      "a third-year student was included in a second-year audience"
    );
  });

  it("finds that student when the semester matches their position", async () => {
    const audience = await resolveAudience({
      collegeId: collegeA,
      programId: programA,
      branchId: branchA,
      regulationId: regulationA,
      semester: 5,
    });

    assert.deepEqual(
      audience.members.map((member) => String(member.userId)),
      [String(studentA3)]
    );
  });

  it("never crosses a college boundary", async () => {
    const audience = await resolveAudience({
      collegeId: collegeA,
      programId: programA,
      branchId: branchA,
      regulationId: regulationA,
      semester: 3,
    });

    assert.ok(!audience.members.some((member) => String(member.userId) === String(studentB1)));
  });

  it("returns nobody rather than everybody for an incomplete coordinate", async () => {
    const audience = await resolveAudience({
      collegeId: collegeA,
      programId: "not-an-id",
      branchId: branchA,
      regulationId: regulationA,
      semester: 3,
    });

    assert.equal(audience.count, 0);
  });
});

// ── §94: student isolation ────────────────────────────────────────────────

describe("students and published work", () => {
  let assignmentId: string;

  before(async () => {
    const subject = await authorizeSubject(teacherA, String(dataStructures));
    assert.ok(subject);

    const created = await Assignment.create({
      teacherId: teacherA.teacherProfileId,
      teacherUserId: teacherA.userId,
      collegeId: collegeA,
      programId: programA,
      branchId: branchA,
      regulationId: regulationA,
      year: 2,
      semester: 3,
      subjectId: dataStructures,
      title: "Implement a Binary Search Tree",
      instructions: "Insertion, search and traversal.",
      submissionType: "text",
      maxMarks: 10,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "draft",
    });

    const result = await publishAssignment(teacherA, subject, String(created._id));
    assignmentId = result.id;

    assert.equal(result.eligibleStudents, 2);
  });

  it("gives the assignment to every eligible student", async () => {
    const rows = await AssignmentStudent.find({ assignmentId }).lean();
    assert.equal(rows.length, 2);
  });

  it("lets an eligible student open it", async () => {
    const assignment = await getStudentAssignment(String(studentA1), assignmentId);
    assert.ok(assignment);
    assert.equal(assignment.title, "Implement a Binary Search Tree");
  });

  /**
   * §94's third test. The student is at another college entirely; the
   * assignment is addressed by a real id, and the answer is the same as for an
   * id that does not exist.
   */
  it("refuses a student from another college", async () => {
    assert.equal(await getStudentAssignment(String(studentB1), assignmentId), null);
  });

  it("refuses a student in the same college but the wrong year", async () => {
    assert.equal(await getStudentAssignment(String(studentA3), assignmentId), null);
  });

  it("answers a foreign id and a missing id identically", async () => {
    const foreign = await getStudentAssignment(String(studentB1), assignmentId);
    const missing = await getStudentAssignment(String(studentB1), String(new Types.ObjectId()));
    const malformed = await getStudentAssignment(String(studentB1), "not-an-id");

    assert.equal(foreign, null);
    assert.equal(missing, null);
    assert.equal(malformed, null);
  });

  it("keeps the assignment after the student moves up a year (§19, §78)", async () => {
    // The materialised row is what makes this true: the audience is resolved at
    // publish time and never re-resolved on read.
    const before = await listStudentAssignments(String(studentA1), {});
    assert.equal(before.cards.length, 1);

    const now = new Date();
    const academicYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

    await StudentProfile.updateOne(
      { userId: studentA1 },
      { $set: { admissionYear: academicYearStart - 2 } }
    );

    const after = await listStudentAssignments(String(studentA1), {});
    assert.equal(after.cards.length, 1, "a moved-up student lost work they had been given");

    // And they are no longer in the audience for new second-year work.
    const audience = await resolveAudience({
      collegeId: collegeA,
      programId: programA,
      branchId: branchA,
      regulationId: regulationA,
      semester: 3,
    });
    assert.ok(!audience.members.some((member) => String(member.userId) === String(studentA1)));

    await StudentProfile.updateOne(
      { userId: studentA1 },
      { $set: { admissionYear: academicYearStart - 1 } }
    );
  });

  // ── Submissions ─────────────────────────────────────────────────────────

  describe("submissions", () => {
    before(async () => {
      await submitAssignment(String(studentA1), assignmentId, {
        content: "Here is my implementation.",
      });
    });

    it("records the submission against the student", async () => {
      const row = await AssignmentStudent.findOne({
        assignmentId,
        studentId: studentA1,
      }).lean();

      assert.equal(row?.status, "submitted");
      assert.equal(row?.attemptCount, 1);
    });

    it("refuses a student who was never given the assignment", async () => {
      await assert.rejects(
        () => submitAssignment(String(studentB1), assignmentId, { content: "not mine" }),
        /could not be found/i
      );
    });

    /**
     * §94's fourth test. A student's own detail read returns *their* submission
     * and nothing else — there is no parameter that reaches another student's.
     */
    it("never shows one student another's submission", async () => {
      const own = await getStudentAssignment(String(studentA1), assignmentId);
      assert.ok(own?.submission);
      assert.match(own.submission.content ?? "", /my implementation/);

      const other = await getStudentAssignment(String(studentA2), assignmentId);
      assert.ok(other);
      assert.equal(other.submission, null, "a student saw another student's submission");
    });

    it("lets the owning teacher see the roster and the submission", async () => {
      const { rows } = await listSubmissions(teacherA, assignmentId, {});
      assert.equal(rows.length, 2);

      const submission = await getSubmission(teacherA, assignmentId, String(studentA1));
      assert.ok(submission);
      assert.equal(submission.attempts.length, 1);
    });

    /**
     * §94's fifth test. Another teacher at the *same college* — who teaches a
     * different subject — cannot reach this assignment's submissions.
     */
    it("refuses another teacher at the same college", async () => {
      await assert.rejects(
        () => listSubmissions(otherTeacherA, assignmentId, {}),
        /could not be found/i
      );

      assert.equal(await getSubmission(otherTeacherA, assignmentId, String(studentA1)), null);
    });

    it("refuses a teacher from another college", async () => {
      await assert.rejects(
        () => listSubmissions(teacherB, assignmentId, {}),
        /could not be found/i
      );
    });
  });
});

// ── Notes ─────────────────────────────────────────────────────────────────

describe("notes", () => {
  let noteId: string;

  before(async () => {
    const note = await Note.create({
      teacherId: teacherA.teacherProfileId,
      teacherUserId: teacherA.userId,
      collegeId: collegeA,
      programId: programA,
      branchId: branchA,
      regulationId: regulationA,
      year: 2,
      semester: 3,
      subjectId: dataStructures,
      title: "Trees — lecture notes",
      content: "A tree is a hierarchical structure.",
      status: "published",
      publishedAt: new Date(),
    });

    noteId = String(note._id);

    await NoteRecipient.create({
      noteId: note._id,
      studentId: studentA1,
      subjectId: dataStructures,
      collegeId: collegeA,
      publishedAt: new Date(),
    });
  });

  it("lets the recipient read it", async () => {
    const { note } = await getStudentNote(String(studentA1), noteId);
    assert.ok(note);
    assert.equal(note.title, "Trees — lecture notes");
  });

  it("refuses somebody who was never sent it", async () => {
    const { note, archived } = await getStudentNote(String(studentB1), noteId);
    assert.equal(note, null);
    assert.equal(archived, false);
  });

  /**
   * §78's "student opens archived note". They *were* sent it and may hold a
   * bookmark, so the answer distinguishes "taken down" from "never existed" —
   * which a 404 could not.
   */
  it("says an archived note was taken down rather than not found", async () => {
    await Note.updateOne({ _id: noteId }, { $set: { status: "archived" } });

    const { note, archived } = await getStudentNote(String(studentA1), noteId);
    assert.equal(note, null);
    assert.equal(archived, true);

    await Note.updateOne({ _id: noteId }, { $set: { status: "published" } });
  });
});

// ── §63: deduplication ────────────────────────────────────────────────────

describe("notification deduplication", () => {
  const entityId = new Types.ObjectId();

  it("writes one row per recipient", async () => {
    const result = await notify({
      recipientIds: [String(studentA1), String(studentA2)],
      type: "ASSIGNMENT_PUBLISHED",
      entityType: "assignment",
      entityId,
      data: { title: "Test", subjectName: "Data Structures" },
    });

    assert.equal(result.created, 2);
  });

  /**
   * The property a retried fan-out depends on. The unique index makes this a
   * database guarantee rather than a check the fan-out has to remember — and
   * the fan-out is the code most likely to be retried.
   */
  it("sends nothing the second time", async () => {
    const result = await notify({
      recipientIds: [String(studentA1), String(studentA2)],
      type: "ASSIGNMENT_PUBLISHED",
      entityType: "assignment",
      entityId,
      data: { title: "Test", subjectName: "Data Structures" },
    });

    assert.equal(result.created, 0);
    assert.equal(result.duplicates, 2);

    const rows = await Notification.countDocuments({
      type: "ASSIGNMENT_PUBLISHED",
      entityId,
    });
    assert.equal(rows, 2);
  });

  it("does not resurrect a notification the student has already read", async () => {
    await Notification.updateOne(
      { recipientId: studentA1, entityId },
      { $set: { isRead: true, readAt: new Date() } }
    );

    await notify({
      recipientIds: [String(studentA1)],
      type: "ASSIGNMENT_PUBLISHED",
      entityType: "assignment",
      entityId,
      data: { title: "Test" },
    });

    const row = await Notification.findOne({ recipientId: studentA1, entityId }).lean();
    assert.equal(row?.isRead, true, "a retried fan-out marked a read notification unread");
  });

  it("honours a preference that switched the category off", async () => {
    const { NotificationPreference } = await import("../../src/models/Notification");

    await NotificationPreference.create({
      userId: studentA2,
      channels: { notes: { in_app: false, email: false, push: false } },
    });

    const result = await notify({
      recipientIds: [String(studentA2)],
      type: "NOTE_PUBLISHED",
      entityType: "note",
      entityId: new Types.ObjectId(),
      data: { title: "Muted" },
    });

    assert.equal(result.created, 0);
    assert.equal(result.suppressed, 1);
  });
});
