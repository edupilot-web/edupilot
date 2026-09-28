import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { AcademicYear } from "@/models/AcademicStructure";
import { Note, NoteRecipient } from "@/models/Note";
import { Topic } from "@/models/Topic";
import { notify } from "@/lib/notifications/service";
import { resolveAudience, type AudienceResult } from "@/lib/teaching/audience";
import { claimAttachments, releaseAttachments } from "@/lib/teaching/attachments";
import {
  canTransitionNote,
  noteTypeFor,
  TEACHING_LIMITS,
  type NoteStatus,
} from "@/lib/teaching/fields";
import type { AuthorizedSubject, TeacherContext } from "@/lib/teaching/teacher";
import {
  ValidationError,
  toAttachmentInput,
  type AttachmentInput,
  type ValidationIssue,
} from "@/lib/teaching/assignments";

/**
 * NoteService — sharing study material (§28, §61).
 *
 * The same publish pipeline as an assignment, minus everything a note does not
 * have: no deadline, no per-student state machine, no grading. What it keeps is
 * the part that matters — the audience is resolved from the curriculum, never
 * chosen by hand, and the recipients are materialised so the note stays with
 * the student after they move on.
 *
 * `NoteRecipient` looks like overhead for something with no state, and it is
 * what makes "historical notes remain accessible" (§101) true. Resolving the
 * audience live on every read would quietly take last semester's notes away
 * from a student the moment they moved up a year.
 */

export type NoteInput = {
  subjectId: string;
  topicId?: string | null;
  title: string;
  description?: string | null;
  content?: string | null;
  attachments?: AttachmentInput[];
  externalLinks?: { label?: string | null; url: string }[];
};

export function validateNote(
  input: NoteInput,
  options: { forPublish: boolean }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const title = input.title?.trim() ?? "";
  if (title.length < 3) {
    issues.push({ field: "title", message: "Give these notes a title." });
  } else if (title.length > TEACHING_LIMITS.titleMax) {
    issues.push({ field: "title", message: "That title is too long." });
  }

  if ((input.description?.length ?? 0) > TEACHING_LIMITS.descriptionMax) {
    issues.push({ field: "description", message: "That description is too long." });
  }
  if ((input.content?.length ?? 0) > TEACHING_LIMITS.noteContentMax) {
    issues.push({ field: "content", message: "That is more text than a note can hold." });
  }
  if ((input.attachments?.length ?? 0) > TEACHING_LIMITS.maxAttachmentsPerItem) {
    issues.push({ field: "attachments", message: "Attach at most 10 files." });
  }
  if ((input.externalLinks?.length ?? 0) > TEACHING_LIMITS.maxExternalLinks) {
    issues.push({ field: "externalLinks", message: "Add at most 10 links." });
  }

  for (const link of input.externalLinks ?? []) {
    if (!isSafeUrl(link.url)) {
      issues.push({
        field: "externalLinks",
        // `javascript:` and `data:` in an href are a script the student runs by
        // clicking, which is why the scheme is checked rather than the shape.
        message: `"${link.url.slice(0, 40)}" is not a valid http or https link.`,
      });
    }
  }

  /**
   * A note with nothing in it is the one thing publishing must refuse.
   *
   * A student receiving a notification for a note that turns out to be a title
   * and nothing else learns to ignore the notifications.
   */
  if (options.forPublish) {
    const hasSubstance =
      Boolean(input.content?.trim()) ||
      (input.attachments?.length ?? 0) > 0 ||
      (input.externalLinks?.length ?? 0) > 0;

    if (!hasSubstance) {
      issues.push({
        field: "content",
        message: "Add some text, a file or a link before publishing.",
      });
    }
  }

  return issues;
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ── Create and edit ───────────────────────────────────────────────────────

export async function createNote(
  teacher: TeacherContext,
  subject: AuthorizedSubject,
  input: NoteInput
): Promise<{ id: string }> {
  const issues = validateNote(input, { forPublish: false });
  if (issues.length) throw new ValidationError(issues);

  await connectDB();

  const topicId = await resolveTopic(input.topicId, subject.subjectId);

  const created = await Note.create({
    teacherId: teacher.teacherProfileId,
    teacherUserId: teacher.userId,

    // From the authorised subject, never the request (§10, §77).
    collegeId: subject.collegeId,
    programId: subject.programId,
    branchId: subject.branchId,
    regulationId: subject.regulationId,
    year: subject.year,
    semester: subject.semester,
    subjectId: subject.subjectId,
    topicId,
    admissionYear: subject.admissionYear,

    title: input.title.trim(),
    description: input.description?.trim() || null,
    content: input.content?.trim() || null,
    attachments: [],
    externalLinks: input.externalLinks ?? [],
    noteType: noteTypeFor(input),
    status: "draft",
  });

  const attachments = await claimAttachments({
    uploadedBy: teacher.userId,
    attachments: input.attachments,
    attachedToType: "note",
    attachedToId: created._id,
  });

  if (attachments.length) {
    await Note.updateOne(
      { _id: created._id },
      { $set: { attachments, noteType: noteTypeFor({ ...input, attachments }) } }
    );
  }

  return { id: String(created._id) };
}

export async function updateNote(
  teacher: TeacherContext,
  noteId: string,
  input: Partial<NoteInput>
): Promise<{ id: string }> {
  await connectDB();

  const existing = await ownedNote(teacher, noteId);

  const merged: NoteInput = {
    subjectId: String(existing.subjectId),
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    content: input.content ?? existing.content,
    attachments: input.attachments ?? toAttachmentInput(existing.attachments),
    externalLinks: input.externalLinks ?? existing.externalLinks,
  };

  const issues = validateNote(merged, { forPublish: existing.status === "published" });
  if (issues.length) throw new ValidationError(issues);

  const claimed =
    input.attachments !== undefined
      ? await claimAttachments({
          uploadedBy: teacher.userId,
          attachments: input.attachments,
          attachedToType: "note",
          attachedToId: existing._id,
        })
      : null;

  if (claimed) {
    await releaseAttachments({
      attachedToType: "note",
      attachedToId: existing._id,
      keepFileIds: claimed.map((file) => file.fileId),
    });
  }

  await Note.updateOne(
    { _id: existing._id },
    {
      $set: {
        title: merged.title.trim(),
        description: merged.description?.trim() || null,
        content: merged.content?.trim() || null,
        ...(claimed ? { attachments: claimed } : {}),
        ...(input.externalLinks !== undefined ? { externalLinks: input.externalLinks } : {}),
        noteType: noteTypeFor({ ...merged, attachments: claimed ?? merged.attachments }),
      },
    }
  );

  /**
   * Editing a published note does **not** notify.
   *
   * Unlike an assignment, nothing about a note is time-bound or owed back, so
   * a correction is not something a student has to act on. §79's "do not
   * notify for every minor edit" applied to notes means not notifying at all —
   * and a teacher who genuinely wants to announce a rewrite can archive and
   * publish afresh.
   */
  return { id: String(existing._id) };
}

// ── Publish (§61) ─────────────────────────────────────────────────────────

export type NotePublishResult = {
  id: string;
  eligibleStudents: number;
  audience: AudienceResult["skipped"];
  batchId: string;
  warning: string | null;
};

export async function publishNote(
  teacher: TeacherContext,
  subject: AuthorizedSubject,
  noteId: string
): Promise<NotePublishResult> {
  await connectDB();

  const note = await ownedNote(teacher, noteId);

  if (!canTransitionNote(note.status as NoteStatus, "published")) {
    throw new HttpError(409, `Notes that are ${note.status} cannot be published.`);
  }

  const issues = validateNote(
    {
      subjectId: String(note.subjectId),
      title: note.title,
      description: note.description,
      content: note.content,
      attachments: toAttachmentInput(note.attachments),
      externalLinks: note.externalLinks,
    },
    { forPublish: true }
  );
  if (issues.length) throw new ValidationError(issues);

  const audience = await resolveAudience({
    collegeId: subject.collegeId,
    programId: subject.programId,
    branchId: subject.branchId,
    regulationId: subject.regulationId,
    semester: subject.semester,
    admissionYear: subject.admissionYear,
  });

  const [topic, academicYear] = await Promise.all([
    note.topicId ? Topic.findById(note.topicId).select("title").lean() : null,
    AcademicYear.findOne({ isCurrent: true }).select("label").lean(),
  ]);

  const now = new Date();
  const batchId = randomUUID();

  await Note.updateOne(
    { _id: note._id },
    {
      $set: {
        status: "published",
        publishedAt: note.publishedAt ?? now,
        audienceCount: audience.count,
        academicYearId: academicYear?._id ?? note.academicYearId ?? null,
        targetSnapshot: {
          collegeName: teacher.collegeName,
          programName: subject.programName,
          branchName: subject.branchName,
          regulationCode: subject.regulationCode,
          academicYearLabel: academicYear?.label ?? null,
          batchLabel: subject.admissionYear ? `${subject.admissionYear} intake` : null,
          yearLabel: `Year ${subject.year}`,
          semesterLabel: `Semester ${subject.semester}`,
          subjectName: subject.name,
          subjectCode: subject.code,
          topicTitle: topic?.title ?? null,
          teacherName: teacher.name,
          eligibleStudentCount: audience.count,
        },
      },
    }
  );

  await materialiseNoteRecipients({
    noteId: note._id,
    subjectId: note.subjectId,
    collegeId: note.collegeId,
    publishedAt: note.publishedAt ?? now,
    studentIds: audience.members.map((member) => member.userId),
  });

  return {
    id: String(note._id),
    eligibleStudents: audience.count,
    audience: audience.skipped,
    batchId,
    warning:
      audience.count === 0
        ? "No students currently match this subject's year and semester, so nobody was notified. The notes are published and will appear for students in that cohort when they exist."
        : null,
  };
}

/** Deferred by the route through `after()`. Idempotent. */
export async function notifyNotePublished(
  noteId: string,
  batchId?: string | null
): Promise<number> {
  await connectDB();

  const note = await Note.findById(noteId).lean();
  if (!note || note.status !== "published") return 0;

  const recipients = await NoteRecipient.find({ noteId: note._id }).select("studentId").lean();
  if (!recipients.length) return 0;

  const result = await notify({
    recipientIds: recipients.map((row) => row.studentId),
    type: "NOTE_PUBLISHED",
    entityType: "note",
    entityId: note._id,
    data: {
      title: note.title,
      subjectName: note.targetSnapshot?.subjectName ?? null,
      teacherName: note.targetSnapshot?.teacherName ?? null,
    },
    batchId: batchId ?? null,
  });

  return result.created;
}

export async function transitionNote(
  teacher: TeacherContext,
  noteId: string,
  to: NoteStatus
): Promise<{ id: string; status: NoteStatus }> {
  await connectDB();

  const note = await ownedNote(teacher, noteId);
  const from = note.status as NoteStatus;

  if (!canTransitionNote(from, to)) {
    throw new HttpError(409, `Notes that are ${from} cannot become ${to}.`);
  }

  await Note.updateOne(
    { _id: note._id },
    {
      $set: {
        status: to,
        ...(to === "archived" ? { archivedAt: new Date() } : {}),
        ...(to === "published" && from === "archived" ? { archivedAt: null } : {}),
      },
    }
  );

  return { id: String(note._id), status: to };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function ownedNote(teacher: TeacherContext, noteId: string) {
  if (!Types.ObjectId.isValid(noteId)) {
    throw new HttpError(404, "Those notes could not be found.");
  }

  const note = await Note.findOne({
    _id: noteId,
    teacherUserId: teacher.userId,
    collegeId: teacher.collegeId,
  }).lean();

  if (!note) throw new HttpError(404, "Those notes could not be found.");
  return note;
}

async function resolveTopic(
  topicId: string | null | undefined,
  subjectId: string
): Promise<Types.ObjectId | null> {
  if (!topicId || !Types.ObjectId.isValid(topicId)) return null;
  const topic = await Topic.findOne({ _id: topicId, subjectId }).select("_id").lean();
  return topic?._id ?? null;
}

const RECIPIENT_CHUNK = 500;

async function materialiseNoteRecipients(input: {
  noteId: Types.ObjectId;
  subjectId: Types.ObjectId;
  collegeId: Types.ObjectId;
  publishedAt: Date;
  studentIds: Types.ObjectId[];
}): Promise<number> {
  let created = 0;

  for (let index = 0; index < input.studentIds.length; index += RECIPIENT_CHUNK) {
    const chunk = input.studentIds.slice(index, index + RECIPIENT_CHUNK);

    const operations = chunk.map((studentId) => ({
      insertOne: {
        document: {
          noteId: input.noteId,
          studentId,
          subjectId: input.subjectId,
          collegeId: input.collegeId,
          publishedAt: input.publishedAt,
          viewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    }));

    try {
      const written = await NoteRecipient.bulkWrite(operations, { ordered: false });
      created += written.insertedCount ?? 0;
    } catch (err) {
      const error = err as { insertedCount?: number };
      created += error.insertedCount ?? 0;
    }
  }

  return created;
}
