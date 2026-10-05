import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Assignment, AssignmentStudent } from "@/models/Assignment";
import { Note } from "@/models/Note";
import { TeacherAcademicAssignment } from "@/models/Teacher";
import { countAudience } from "@/lib/teaching/audience";
import type { AuthorizedSubject, TeacherContext } from "@/lib/teaching/teacher";
import type { AssignmentStatus, NoteStatus } from "@/lib/teaching/fields";

/**
 * The teacher's own reads: their lists, their dashboard, their engagement
 * numbers (§7, §42, §46, §47, §81).
 *
 * Every query here is filtered on `teacherUserId` **and** `collegeId`. The
 * second is redundant while a teacher has one college and is the check that
 * stays correct if that ever changes — §66 asks for both and the cost is a
 * field comparison on an index that already exists.
 */

// ── Assignment list (§42) ─────────────────────────────────────────────────

export type TeacherAssignmentRow = {
  id: string;
  title: string;
  subjectName: string | null;
  subjectCode: string | null;
  status: AssignmentStatus;
  dueAt: string | null;
  publishedAt: string | null;
  assignedCount: number;
  viewedCount: number;
  submittedCount: number;
  lateCount: number;
  gradedCount: number;
  /** Assigned minus submitted — the number a teacher actually chases. */
  pendingCount: number;
  maxMarks: number | null;
};

export async function listTeacherAssignments(
  teacher: TeacherContext,
  options: {
    status?: string | null;
    subjectId?: string | null;
    search?: string | null;
    limit?: number;
    skip?: number;
  } = {}
): Promise<{ rows: TeacherAssignmentRow[]; total: number }> {
  await connectDB();

  const filter: Record<string, unknown> = {
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  };

  if (options.status && options.status !== "all") filter.status = options.status;
  if (options.subjectId && Types.ObjectId.isValid(options.subjectId)) {
    filter.subjectId = options.subjectId;
  }
  if (options.search?.trim()) {
    // A prefix-tolerant regex, not the text index: a teacher typing "bin"
    // expects "Binary Search Trees", and a text index matches whole terms.
    filter.title = new RegExp(escapeRegExp(options.search.trim()), "i");
  }

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);

  const [rows, total] = await Promise.all([
    Assignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Assignment.countDocuments(filter),
  ]);

  return {
    rows: rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      subjectName: row.targetSnapshot?.subjectName ?? null,
      subjectCode: row.targetSnapshot?.subjectCode ?? null,
      status: row.status as AssignmentStatus,
      dueAt: row.dueAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      assignedCount: row.assignedCount ?? 0,
      viewedCount: row.viewedCount ?? 0,
      submittedCount: row.submittedCount ?? 0,
      lateCount: row.lateCount ?? 0,
      gradedCount: row.gradedCount ?? 0,
      pendingCount: Math.max(0, (row.assignedCount ?? 0) - (row.submittedCount ?? 0)),
      maxMarks: row.maxMarks ?? null,
    })),
    total,
  };
}

export async function getTeacherAssignment(teacher: TeacherContext, assignmentId: string) {
  if (!Types.ObjectId.isValid(assignmentId)) return null;

  await connectDB();

  const assignment = await Assignment.findOne({
    _id: assignmentId,
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  }).lean();

  if (!assignment) return null;

  return {
    id: String(assignment._id),
    subjectId: String(assignment.subjectId),
    topicId: assignment.topicId ? String(assignment.topicId) : null,
    title: assignment.title,
    description: assignment.description ?? null,
    instructions: assignment.instructions ?? null,
    submissionType: assignment.submissionType,
    maxMarks: assignment.maxMarks ?? null,
    dueAt: assignment.dueAt?.toISOString() ?? null,
    allowLateSubmission: assignment.allowLateSubmission === true,
    lateSubmissionUntil: assignment.lateSubmissionUntil?.toISOString() ?? null,
    status: assignment.status as AssignmentStatus,
    attachments: (assignment.attachments ?? []).map((file) => ({
      fileId: String(file.fileId),
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
    })),
    targetSnapshot: assignment.targetSnapshot ?? null,
    stats: {
      assigned: assignment.assignedCount ?? 0,
      viewed: assignment.viewedCount ?? 0,
      submitted: assignment.submittedCount ?? 0,
      late: assignment.lateCount ?? 0,
      graded: assignment.gradedCount ?? 0,
      pending: Math.max(0, (assignment.assignedCount ?? 0) - (assignment.submittedCount ?? 0)),
    },
    publishedAt: assignment.publishedAt?.toISOString() ?? null,
    closedAt: assignment.closedAt?.toISOString() ?? null,
  };
}

// ── Note list (§46) ───────────────────────────────────────────────────────

export type TeacherNoteRow = {
  id: string;
  title: string;
  subjectName: string | null;
  subjectCode: string | null;
  noteType: string;
  status: NoteStatus;
  publishedAt: string | null;
  audienceCount: number;
  viewCount: number;
  uniqueViewerCount: number;
  downloadCount: number;
  bookmarkCount: number;
};

export async function listTeacherNotes(
  teacher: TeacherContext,
  options: { status?: string | null; subjectId?: string | null; limit?: number; skip?: number } = {}
): Promise<{ rows: TeacherNoteRow[]; total: number }> {
  await connectDB();

  const filter: Record<string, unknown> = {
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  };

  if (options.status && options.status !== "all") filter.status = options.status;
  if (options.subjectId && Types.ObjectId.isValid(options.subjectId)) {
    filter.subjectId = options.subjectId;
  }

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);

  const [rows, total] = await Promise.all([
    Note.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Note.countDocuments(filter),
  ]);

  return {
    rows: rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      subjectName: row.targetSnapshot?.subjectName ?? null,
      subjectCode: row.targetSnapshot?.subjectCode ?? null,
      noteType: row.noteType ?? "text",
      status: row.status as NoteStatus,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      audienceCount: row.audienceCount ?? 0,
      viewCount: row.viewCount ?? 0,
      uniqueViewerCount: row.uniqueViewerCount ?? 0,
      downloadCount: row.downloadCount ?? 0,
      bookmarkCount: row.bookmarkCount ?? 0,
    })),
    total,
  };
}

export async function getTeacherNote(teacher: TeacherContext, noteId: string) {
  if (!Types.ObjectId.isValid(noteId)) return null;

  await connectDB();

  const note = await Note.findOne({
    _id: noteId,
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  }).lean();

  if (!note) return null;

  return {
    id: String(note._id),
    subjectId: String(note.subjectId),
    topicId: note.topicId ? String(note.topicId) : null,
    title: note.title,
    description: note.description ?? null,
    content: note.content ?? null,
    noteType: note.noteType ?? "text",
    status: note.status as NoteStatus,
    attachments: (note.attachments ?? []).map((file) => ({
      fileId: String(file.fileId),
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
    })),
    externalLinks: (note.externalLinks ?? []).map((link) => ({
      label: link.label ?? null,
      url: link.url,
    })),
    targetSnapshot: note.targetSnapshot ?? null,
    stats: {
      audience: note.audienceCount ?? 0,
      views: note.viewCount ?? 0,
      uniqueViewers: note.uniqueViewerCount ?? 0,
      downloads: note.downloadCount ?? 0,
      bookmarks: note.bookmarkCount ?? 0,
    },
    publishedAt: note.publishedAt?.toISOString() ?? null,
  };
}

// ── Dashboard (§7, §81) ───────────────────────────────────────────────────

export type TeacherDashboard = {
  assignments: { total: number; published: number; draft: number };
  notes: { total: number; published: number };
  students: number;
  subjects: number;
  submissions: { received: number; pendingReview: number };
  submissionRate: number | null;
  dueSoon: {
    id: string;
    title: string;
    subjectName: string | null;
    dueAt: string;
    submitted: number;
    assigned: number;
  }[];
  recentSubmissions: {
    assignmentId: string;
    assignmentTitle: string;
    studentName: string;
    submittedAt: string;
    isLate: boolean;
  }[];
};

/**
 * The dashboard's numbers, in a bounded set of queries.
 *
 * Counts come from the roll-ups on `Assignment` rather than from aggregating
 * `AssignmentStudent`, which is what makes this a handful of `countDocuments`
 * instead of a group-by over every row the teacher has ever published to.
 *
 * "Students" is the size of the audience across their *current* subjects, not a
 * sum of assignment audiences — a teacher with three assignments for one class
 * teaches one class, and summing would tell them they have 552 students.
 */
export async function getTeacherDashboard(
  teacher: TeacherContext,
  subjects: AuthorizedSubject[]
): Promise<TeacherDashboard> {
  await connectDB();

  const scope = { teacherUserId: teacher.userId, collegeId: teacher.collegeId };

  const [
    assignmentTotal,
    assignmentPublished,
    assignmentDraft,
    noteTotal,
    notePublished,
    dueSoonRows,
    publishedAssignments,
  ] = await Promise.all([
    Assignment.countDocuments(scope),
    Assignment.countDocuments({ ...scope, status: "published" }),
    Assignment.countDocuments({ ...scope, status: "draft" }),
    Note.countDocuments(scope),
    Note.countDocuments({ ...scope, status: "published" }),
    Assignment.find({ ...scope, status: "published", dueAt: { $gte: new Date() } })
      .sort({ dueAt: 1 })
      .limit(5)
      .select("title targetSnapshot dueAt submittedCount assignedCount")
      .lean(),
    Assignment.find({ ...scope, status: { $in: ["published", "closed"] } })
      .select("assignedCount submittedCount gradedCount title")
      .lean(),
  ]);

  const ownIds = publishedAssignments.map((row) => row._id);
  const titleById = new Map(publishedAssignments.map((row) => [String(row._id), row.title]));

  /**
   * Scoped to **this teacher's assignments**, in the query.
   *
   * It used to fetch the forty most recent submissions across the whole
   * platform and narrow them afterwards. That is correct on an empty database
   * and wrong on a real one: with any other teacher active, this teacher's rows
   * fall outside the global forty and the panel reads "Nothing handed in yet"
   * while their students are handing work in. The filter has to be *in* the
   * query for the limit to mean "forty of mine".
   *
   * `graded` is included. The panel is recent activity, not a queue — marking a
   * submission should not erase the fact that it arrived, and "how many are
   * waiting" is already its own figure above.
   */
  const recentRows = ownIds.length
    ? await AssignmentStudent.find({
        assignmentId: { $in: ownIds },
        status: { $in: ["submitted", "late", "graded"] },
        submittedAt: { $ne: null },
      })
        .sort({ submittedAt: -1 })
        .limit(6)
        .select("assignmentId studentId submittedAt status")
        .lean()
    : [];

  const assigned = publishedAssignments.reduce((sum, row) => sum + (row.assignedCount ?? 0), 0);
  const submitted = publishedAssignments.reduce((sum, row) => sum + (row.submittedCount ?? 0), 0);
  const graded = publishedAssignments.reduce((sum, row) => sum + (row.gradedCount ?? 0), 0);

  const ownRecent = recentRows;

  const studentNames = ownRecent.length
    ? await (await import("@/models/User")).User.find({
        _id: { $in: ownRecent.map((row) => row.studentId) },
      })
        .select("name")
        .lean()
    : [];

  const nameById = new Map(studentNames.map((user) => [String(user._id), user.name]));

  // Distinct audience across the subjects they currently teach.
  const audiences = await Promise.all(
    subjects.slice(0, 12).map((subject) =>
      countAudience({
        collegeId: subject.collegeId,
        programId: subject.programId,
        branchId: subject.branchId,
        regulationId: subject.regulationId,
        semester: subject.semester,
        admissionYear: subject.admissionYear,
      })
    )
  );

  const distinctStudents = new Set<string>();
  for (const audience of audiences) {
    for (const member of audience.members) distinctStudents.add(String(member.userId));
  }

  return {
    assignments: {
      total: assignmentTotal,
      published: assignmentPublished,
      draft: assignmentDraft,
    },
    notes: { total: noteTotal, published: notePublished },
    students: distinctStudents.size,
    subjects: subjects.length,
    submissions: { received: submitted, pendingReview: Math.max(0, submitted - graded) },
    submissionRate: assigned > 0 ? Math.round((submitted / assigned) * 100) : null,
    dueSoon: dueSoonRows.map((row) => ({
      id: String(row._id),
      title: row.title,
      subjectName: row.targetSnapshot?.subjectName ?? null,
      dueAt: row.dueAt!.toISOString(),
      submitted: row.submittedCount ?? 0,
      assigned: row.assignedCount ?? 0,
    })),
    recentSubmissions: ownRecent.map((row) => ({
      assignmentId: String(row.assignmentId),
      assignmentTitle: titleById.get(String(row.assignmentId)) ?? "Assignment",
      studentName: nameById.get(String(row.studentId)) ?? "A student",
      submittedAt: row.submittedAt?.toISOString() ?? new Date().toISOString(),
      isLate: row.status === "late",
    })),
  };
}

/**
 * The students a teacher may see (§45).
 *
 * Resolved from the subjects they are assigned, so the list is their classes
 * rather than the platform's student directory. The projection is deliberately
 * thin — name, email, the cohort — because §45 forbids exposing private account
 * information and a teacher has no need for a phone number to mark an
 * assignment.
 */
export async function listTeacherStudents(
  teacher: TeacherContext,
  subjects: AuthorizedSubject[],
  options: { subjectId?: string | null; search?: string | null } = {}
): Promise<{
  students: { id: string; name: string; email: string; admissionYear: number | null; subjects: string[] }[];
  total: number;
}> {
  const wanted = options.subjectId
    ? subjects.filter((subject) => subject.subjectId === options.subjectId)
    : subjects;

  if (!wanted.length) return { students: [], total: 0 };

  const byStudent = new Map<
    string,
    { id: string; name: string; email: string; admissionYear: number | null; subjects: Set<string> }
  >();

  for (const subject of wanted.slice(0, 12)) {
    const audience = await countAudience({
      collegeId: subject.collegeId,
      programId: subject.programId,
      branchId: subject.branchId,
      regulationId: subject.regulationId,
      semester: subject.semester,
      admissionYear: subject.admissionYear,
    });

    for (const member of audience.members) {
      const key = String(member.userId);
      const existing = byStudent.get(key);

      if (existing) {
        existing.subjects.add(subject.name);
        continue;
      }

      byStudent.set(key, {
        id: key,
        name: member.name,
        email: member.email,
        admissionYear: member.admissionYear,
        subjects: new Set([subject.name]),
      });
    }
  }

  let students = [...byStudent.values()].map((entry) => ({
    ...entry,
    subjects: [...entry.subjects],
  }));

  if (options.search?.trim()) {
    const needle = options.search.trim().toLowerCase();
    students = students.filter(
      (student) =>
        student.name.toLowerCase().includes(needle) ||
        student.email.toLowerCase().includes(needle)
    );
  }

  students.sort((a, b) => a.name.localeCompare(b.name));

  return { students, total: students.length };
}

/** How many subjects this teacher is assigned — for the empty-state copy. */
export async function countTeacherSubjects(teacher: TeacherContext): Promise<number> {
  await connectDB();
  return TeacherAcademicAssignment.countDocuments({
    userId: teacher.userId,
    collegeId: teacher.collegeId,
    status: "active",
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
