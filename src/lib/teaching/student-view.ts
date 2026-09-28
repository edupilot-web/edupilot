import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Assignment, AssignmentStudent, AssignmentSubmission } from "@/models/Assignment";
import { Note, NoteBookmark, NoteRecipient, NoteView } from "@/models/Note";
import { submissionWindow } from "@/lib/teaching/submissions";
import {
  isSubmittedStatus,
  type AssignmentStudentStatus,
} from "@/lib/teaching/fields";

/**
 * What a student sees (§25, §26, §32, §33).
 *
 * Every read here starts from the student's **own materialised row** —
 * `AssignmentStudent` or `NoteRecipient` — and never from the academic
 * coordinate. That single choice settles four requirements at once:
 *
 *   - authorisation, because a student with no row has no way in (§94);
 *   - §19, because the rows record who the work was set for at the time;
 *   - "historical assignments remain accessible" (§101), because moving up a
 *     year does not remove them;
 *   - and the list being one indexed query rather than a live audience
 *     resolution per page load.
 */

// ── Assignments ───────────────────────────────────────────────────────────

export type StudentAssignmentCard = {
  id: string;
  title: string;
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string | null;
  dueAt: string | null;
  status: AssignmentStudentStatus;
  /** What the card badge says — derived, because "overdue" is a clock fact. */
  displayStatus: "pending" | "submitted" | "overdue" | "graded";
  marks: number | null;
  maxMarks: number | null;
  submittedAt: string | null;
  isClosed: boolean;
};

export type AssignmentFilter = "all" | "pending" | "submitted" | "overdue" | "completed";

/**
 * The student's assignment list.
 *
 * `overdue` is computed rather than stored, and that is deliberate: it is a
 * function of the clock, so storing it would mean a job that walks every row at
 * midnight and a window in which the badge is wrong. The filter therefore runs
 * in two parts — the database narrows to what it can express, and the clock
 * decides the rest.
 */
export async function listStudentAssignments(
  userId: string,
  options: { filter?: AssignmentFilter; subjectId?: string | null; limit?: number; skip?: number } = {}
): Promise<{ cards: StudentAssignmentCard[]; total: number; counts: Record<AssignmentFilter, number> }> {
  await connectDB();

  const filter: Record<string, unknown> = { studentId: userId };
  if (options.subjectId && Types.ObjectId.isValid(options.subjectId)) {
    filter.subjectId = options.subjectId;
  }

  const records = await AssignmentStudent.find(filter)
    .sort({ dueAt: 1, createdAt: -1 })
    .limit(300)
    .lean();

  if (!records.length) {
    return { cards: [], total: 0, counts: emptyCounts() };
  }

  const assignments = await Assignment.find({
    _id: { $in: records.map((row) => row.assignmentId) },
  })
    .select("title targetSnapshot maxMarks status dueAt allowLateSubmission lateSubmissionUntil")
    .lean();

  const assignmentById = new Map(assignments.map((row) => [String(row._id), row]));
  const now = Date.now();

  const all: StudentAssignmentCard[] = records
    .map((record) => {
      const assignment = assignmentById.get(String(record.assignmentId));
      // A row whose assignment has been hard-deleted is a broken pair, not
      // something to render as a blank card.
      if (!assignment) return null;

      const status = record.status as AssignmentStudentStatus;
      const submitted = isSubmittedStatus(status);
      const overdue =
        !submitted &&
        Boolean(record.dueAt) &&
        record.dueAt!.getTime() < now &&
        assignment.status !== "closed";

      return {
        id: String(record.assignmentId),
        title: assignment.title,
        subjectName: assignment.targetSnapshot?.subjectName ?? null,
        subjectCode: assignment.targetSnapshot?.subjectCode ?? null,
        teacherName: assignment.targetSnapshot?.teacherName ?? null,
        dueAt: record.dueAt?.toISOString() ?? null,
        status,
        displayStatus:
          status === "graded"
            ? ("graded" as const)
            : submitted
              ? ("submitted" as const)
              : overdue
                ? ("overdue" as const)
                : ("pending" as const),
        marks: record.marks ?? null,
        maxMarks: assignment.maxMarks ?? null,
        submittedAt: record.submittedAt?.toISOString() ?? null,
        isClosed: assignment.status === "closed",
      };
    })
    .filter((card): card is StudentAssignmentCard => card !== null);

  const counts: Record<AssignmentFilter, number> = {
    all: all.length,
    pending: all.filter((card) => card.displayStatus === "pending").length,
    submitted: all.filter((card) => card.displayStatus === "submitted").length,
    overdue: all.filter((card) => card.displayStatus === "overdue").length,
    completed: all.filter((card) => card.displayStatus === "graded").length,
  };

  const wanted = options.filter && options.filter !== "all" ? options.filter : null;
  const filtered = wanted
    ? all.filter((card) =>
        wanted === "completed"
          ? card.displayStatus === "graded"
          : card.displayStatus === wanted
      )
    : all;

  const skip = Math.max(options.skip ?? 0, 0);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  return {
    cards: filtered.slice(skip, skip + limit),
    total: filtered.length,
    counts,
  };
}

export type StudentAssignmentDetail = StudentAssignmentCard & {
  description: string | null;
  instructions: string | null;
  submissionType: string;
  attachments: { fileId: string; fileName: string; mimeType: string; size: number }[];
  allowLateSubmission: boolean;
  lateSubmissionUntil: string | null;
  topicId: string | null;
  subjectId: string;
  feedback: string | null;
  window: ReturnType<typeof submissionWindow>;
  submission: {
    id: string;
    attemptNumber: number;
    content: string | null;
    language: string | null;
    links: string[];
    attachments: { fileId: string; fileName: string; mimeType: string; size: number }[];
    submittedAt: string | null;
    isLate: boolean;
  } | null;
};

export async function getStudentAssignment(
  userId: string,
  assignmentId: string
): Promise<StudentAssignmentDetail | null> {
  if (!Types.ObjectId.isValid(assignmentId)) return null;

  await connectDB();

  // The student's own row is the authorisation — see the note at the top.
  const record = await AssignmentStudent.findOne({ assignmentId, studentId: userId }).lean();
  if (!record) return null;

  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) return null;

  const submission = record.submissionId
    ? await AssignmentSubmission.findById(record.submissionId).lean()
    : null;

  const status = record.status as AssignmentStudentStatus;
  const submitted = isSubmittedStatus(status);
  const overdue =
    !submitted && Boolean(record.dueAt) && record.dueAt!.getTime() < Date.now();

  return {
    id: String(assignment._id),
    subjectId: String(assignment.subjectId),
    topicId: assignment.topicId ? String(assignment.topicId) : null,
    title: assignment.title,
    description: assignment.description ?? null,
    instructions: assignment.instructions ?? null,
    subjectName: assignment.targetSnapshot?.subjectName ?? null,
    subjectCode: assignment.targetSnapshot?.subjectCode ?? null,
    teacherName: assignment.targetSnapshot?.teacherName ?? null,
    submissionType: assignment.submissionType,
    attachments: (assignment.attachments ?? []).map(toAttachment),
    dueAt: assignment.dueAt?.toISOString() ?? null,
    allowLateSubmission: assignment.allowLateSubmission === true,
    lateSubmissionUntil: assignment.lateSubmissionUntil?.toISOString() ?? null,
    status,
    displayStatus:
      status === "graded" ? "graded" : submitted ? "submitted" : overdue ? "overdue" : "pending",
    marks: record.marks ?? null,
    maxMarks: assignment.maxMarks ?? null,
    feedback: record.feedback ?? null,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    isClosed: assignment.status === "closed",
    window: submissionWindow(assignment),
    submission: submission
      ? {
          id: String(submission._id),
          attemptNumber: submission.attemptNumber,
          content: submission.content ?? null,
          language: submission.language ?? null,
          links: submission.links ?? [],
          attachments: (submission.attachments ?? []).map(toAttachment),
          submittedAt: submission.submittedAt?.toISOString() ?? null,
          isLate: submission.isLate,
        }
      : null,
  };
}

// ── Notes ─────────────────────────────────────────────────────────────────

export type StudentNoteCard = {
  id: string;
  title: string;
  description: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string | null;
  topicTitle: string | null;
  noteType: string;
  attachmentCount: number;
  publishedAt: string | null;
  viewedAt: string | null;
  bookmarked: boolean;
};

export type NoteFilter = "all" | "recent" | "bookmarked";

export async function listStudentNotes(
  userId: string,
  options: { filter?: NoteFilter; subjectId?: string | null; limit?: number; skip?: number } = {}
): Promise<{ cards: StudentNoteCard[]; total: number }> {
  await connectDB();

  const bookmarks = await NoteBookmark.find({ studentId: userId }).select("noteId").lean();
  const bookmarked = new Set(bookmarks.map((row) => String(row.noteId)));

  const filter: Record<string, unknown> = { studentId: userId };
  if (options.subjectId && Types.ObjectId.isValid(options.subjectId)) {
    filter.subjectId = options.subjectId;
  }
  if (options.filter === "bookmarked") {
    if (!bookmarks.length) return { cards: [], total: 0 };
    filter.noteId = { $in: bookmarks.map((row) => row.noteId) };
  }

  const recipients = await NoteRecipient.find(filter)
    .sort({ publishedAt: -1 })
    .limit(300)
    .lean();

  if (!recipients.length) return { cards: [], total: 0 };

  /**
   * Archived notes are excluded here, not at publish time.
   *
   * The recipient row stays — the student *was* sent it — but a note the
   * teacher has taken down should stop appearing in the list. §78 asks what
   * happens when "student opens archived note": they reach it by id and get a
   * clear message, rather than finding it in a list and wondering.
   */
  const notes = await Note.find({
    _id: { $in: recipients.map((row) => row.noteId) },
    status: "published",
  })
    .select("title description targetSnapshot noteType attachments publishedAt")
    .lean();

  const noteById = new Map(notes.map((note) => [String(note._id), note]));

  const cards: StudentNoteCard[] = recipients
    .map((recipient): StudentNoteCard | null => {
      const note = noteById.get(String(recipient.noteId));
      if (!note) return null;

      return {
        id: String(note._id),
        title: note.title,
        description: note.description ?? null,
        subjectName: note.targetSnapshot?.subjectName ?? null,
        subjectCode: note.targetSnapshot?.subjectCode ?? null,
        teacherName: note.targetSnapshot?.teacherName ?? null,
        topicTitle: note.targetSnapshot?.topicTitle ?? null,
        noteType: note.noteType ?? "text",
        attachmentCount: note.attachments?.length ?? 0,
        publishedAt: note.publishedAt?.toISOString() ?? null,
        viewedAt: recipient.viewedAt?.toISOString() ?? null,
        bookmarked: bookmarked.has(String(note._id)),
      };
    })
    .filter((card): card is StudentNoteCard => card !== null);

  const skip = Math.max(options.skip ?? 0, 0);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  return { cards: cards.slice(skip, skip + limit), total: cards.length };
}

export type StudentNoteDetail = StudentNoteCard & {
  content: string | null;
  subjectId: string;
  topicId: string | null;
  attachments: { fileId: string; fileName: string; mimeType: string; size: number }[];
  externalLinks: { label: string | null; url: string }[];
};

export async function getStudentNote(
  userId: string,
  noteId: string
): Promise<{ note: StudentNoteDetail | null; archived: boolean }> {
  if (!Types.ObjectId.isValid(noteId)) return { note: null, archived: false };

  await connectDB();

  const recipient = await NoteRecipient.findOne({ noteId, studentId: userId }).lean();
  if (!recipient) return { note: null, archived: false };

  const note = await Note.findById(noteId).lean();
  if (!note) return { note: null, archived: false };

  // Distinguished so the page can say "these notes were taken down" rather
  // than "not found", which would read as a bug to someone holding a bookmark.
  if (note.status !== "published") return { note: null, archived: true };

  const bookmark = await NoteBookmark.exists({ studentId: userId, noteId });

  return {
    archived: false,
    note: {
      id: String(note._id),
      subjectId: String(note.subjectId),
      topicId: note.topicId ? String(note.topicId) : null,
      title: note.title,
      description: note.description ?? null,
      content: note.content ?? null,
      subjectName: note.targetSnapshot?.subjectName ?? null,
      subjectCode: note.targetSnapshot?.subjectCode ?? null,
      teacherName: note.targetSnapshot?.teacherName ?? null,
      topicTitle: note.targetSnapshot?.topicTitle ?? null,
      noteType: note.noteType ?? "text",
      attachmentCount: note.attachments?.length ?? 0,
      attachments: (note.attachments ?? []).map(toAttachment),
      externalLinks: (note.externalLinks ?? []).map((link) => ({
        label: link.label ?? null,
        url: link.url,
      })),
      publishedAt: note.publishedAt?.toISOString() ?? null,
      viewedAt: recipient.viewedAt?.toISOString() ?? null,
      bookmarked: Boolean(bookmark),
    },
  };
}

/**
 * Record that a student opened a note (§73).
 *
 * Three writes, and each counts something different: the recipient row learns
 * *whether*, the view row counts *how often* per student, and the note's
 * roll-up counts opens and — only on the first — unique viewers. Without the
 * per-student row, "164 views by 78 students" could not be told from "164 views
 * by 164 students", which is the number a teacher actually acts on.
 */
export async function recordNoteView(userId: string, noteId: string): Promise<void> {
  if (!Types.ObjectId.isValid(noteId)) return;

  try {
    await connectDB();

    const now = new Date();

    const existing = await NoteView.findOneAndUpdate(
      { noteId, studentId: userId },
      { $inc: { views: 1 }, $set: { lastViewedAt: now }, $setOnInsert: { firstViewedAt: now } },
      { upsert: true, returnDocument: "before" }
    ).lean();

    const firstTime = !existing;

    await Promise.all([
      NoteRecipient.updateOne(
        { noteId, studentId: userId, viewedAt: null },
        { $set: { viewedAt: now } }
      ),
      Note.updateOne(
        { _id: noteId },
        { $inc: { viewCount: 1, ...(firstTime ? { uniqueViewerCount: 1 } : {}) } }
      ),
    ]);
  } catch (err) {
    console.error("[notes] could not record a view:", err);
  }
}

export async function toggleNoteBookmark(
  userId: string,
  noteId: string
): Promise<{ bookmarked: boolean }> {
  if (!Types.ObjectId.isValid(noteId)) return { bookmarked: false };

  await connectDB();

  // Only a note the student actually received may be bookmarked — otherwise a
  // crafted id would put another cohort's note in their saved list.
  const recipient = await NoteRecipient.findOne({ noteId, studentId: userId })
    .select("_id")
    .lean();
  if (!recipient) return { bookmarked: false };

  const existing = await NoteBookmark.findOne({ studentId: userId, noteId }).lean();

  if (existing) {
    await NoteBookmark.deleteOne({ _id: existing._id });
    await Note.updateOne({ _id: noteId }, { $inc: { bookmarkCount: -1 } });
    return { bookmarked: false };
  }

  const note = await Note.findById(noteId).select("title targetSnapshot").lean();

  await NoteBookmark.create({
    studentId: userId,
    noteId,
    noteTitle: note?.title ?? null,
    subjectName: note?.targetSnapshot?.subjectName ?? null,
  });
  await Note.updateOne({ _id: noteId }, { $inc: { bookmarkCount: 1 } });

  return { bookmarked: true };
}

// ── Curriculum integration (§51, §52) ─────────────────────────────────────

export type TopicMaterial = {
  assignments: { id: string; title: string; dueAt: string | null; status: string }[];
  notes: { id: string; title: string; noteType: string; publishedAt: string | null }[];
};

/**
 * The assignments and notes attached to one topic, for this student.
 *
 * Reads from the student's own recipient rows rather than from the topic, so
 * the "Related learning material" block on a topic page shows what *they*
 * received — not everything any teacher has ever attached to that topic, which
 * would include other cohorts' work.
 */
export async function getTopicMaterial(
  userId: string,
  topicId: string
): Promise<TopicMaterial> {
  const empty: TopicMaterial = { assignments: [], notes: [] };
  if (!Types.ObjectId.isValid(topicId)) return empty;

  await connectDB();

  const [assignmentRows, noteRows] = await Promise.all([
    AssignmentStudent.find({ studentId: userId }).select("assignmentId status").lean(),
    NoteRecipient.find({ studentId: userId }).select("noteId").lean(),
  ]);

  if (!assignmentRows.length && !noteRows.length) return empty;

  const [assignments, notes] = await Promise.all([
    assignmentRows.length
      ? Assignment.find({
          _id: { $in: assignmentRows.map((row) => row.assignmentId) },
          topicId,
          status: { $in: ["published", "closed"] },
        })
          .select("title dueAt status")
          .sort({ dueAt: 1 })
          .limit(10)
          .lean()
      : [],
    noteRows.length
      ? Note.find({
          _id: { $in: noteRows.map((row) => row.noteId) },
          topicId,
          status: "published",
        })
          .select("title noteType publishedAt")
          .sort({ publishedAt: -1 })
          .limit(10)
          .lean()
      : [],
  ]);

  const statusById = new Map(
    assignmentRows.map((row) => [String(row.assignmentId), row.status])
  );

  return {
    assignments: assignments.map((assignment) => ({
      id: String(assignment._id),
      title: assignment.title,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      status: statusById.get(String(assignment._id)) ?? "assigned",
    })),
    notes: notes.map((note) => ({
      id: String(note._id),
      title: note.title,
      noteType: note.noteType ?? "text",
      publishedAt: note.publishedAt?.toISOString() ?? null,
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toAttachment(file: {
  fileId: Types.ObjectId;
  fileName: string;
  mimeType: string;
  size: number;
}) {
  return {
    fileId: String(file.fileId),
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.size,
  };
}

function emptyCounts(): Record<AssignmentFilter, number> {
  return { all: 0, pending: 0, submitted: 0, overdue: 0, completed: 0 };
}
