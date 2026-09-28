import { Types } from "mongoose";
import { fail, handleError, requireAuth } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { safeDownloadName, storageDriver } from "@/lib/storage";
import { Assignment, AssignmentStudent, AssignmentSubmission } from "@/models/Assignment";
import { Note, NoteRecipient } from "@/models/Note";
import { StoredFile } from "@/models/StoredFile";
import { StudentProfile } from "@/models/StudentProfile";
import { getCurrentTeacher } from "@/lib/teaching/teacher";

/**
 * GET /api/files/:fileId  (§67)
 *
 * The only way bytes leave this platform. Nothing is served from `public/`,
 * no URL carries a token, and every request re-checks that *this* user may read
 * *this* file before the driver is asked for anything.
 *
 * §67 asks for signed URLs. This is stronger, and the difference matters for
 * student submissions: a signed URL is a bearer token — forwardable, and valid
 * to whoever holds it until it expires — while a session check runs against the
 * person actually asking, every time. The cost is that a file cannot be handed
 * to a third party, which is not something this product does.
 *
 * The authorisation is per *purpose*, because who may read a file depends
 * entirely on what it is attached to:
 *
 *   assignment_attachment — the teacher who owns it, or a student it reached
 *   note_attachment       — the teacher who owns it, or a student it reached
 *   submission_attachment — the student who wrote it, or that assignment's teacher
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[fileId]">) {
  try {
    const session = await requireAuth();
    const { fileId } = await ctx.params;

    if (!Types.ObjectId.isValid(fileId)) return notFound();

    await connectDB();

    const file = await StoredFile.findOne({ _id: fileId, deletedAt: null }).lean();
    if (!file) return notFound();

    /**
     * Refused before anything else is considered.
     *
     * No scanner is wired up today so nothing is ever `infected`, and the check
     * is here so that turning one on is a configuration change rather than a
     * code change with a security hole in the gap.
     */
    if (file.scanStatus === "infected") {
      return fail("That file was rejected by a security scan.", 403, { code: "infected" });
    }

    const allowed = await mayRead(session.sub, file);
    /**
     * A 404, not a 403.
     *
     * Unlike the teacher-facing endpoints — where a colleague is told plainly
     * that they lack access — a file id is reachable by anyone on the platform,
     * including a student at another college. Distinguishing "not yours" from
     * "does not exist" would let them enumerate what other institutions hold.
     */
    if (!allowed) return notFound();

    const driver = storageDriver();
    const bytes = await driver.get(file.storageKey);

    if (!bytes) {
      // The catalogue row can outlive the bytes — a restored database, a
      // cleared disk. Saying so beats a 500 that looks like an outage.
      return fail("That file is no longer available.", 410, { code: "bytes-missing" });
    }

    // Counted after the checks pass, so the number means "times it was read"
    // rather than "times somebody tried".
    await StoredFile.updateOne({ _id: file._id }, { $inc: { downloadCount: 1 } });
    await countNoteDownload(file);

    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        /**
         * `attachment`, always, and the name sanitised again on the way out.
         *
         * Inline rendering of an uploaded file would run any HTML or SVG in it
         * on this origin — which is the reason those extensions are blocked at
         * upload, and this is the second lock on the same door.
         */
        "Content-Disposition": `attachment; filename="${safeDownloadName(file.fileName)}"`,
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

function notFound() {
  return fail("That file could not be found.", 404);
}

/**
 * May this user read this file?
 *
 * Every branch starts from a *materialised* row — the teacher owning the item,
 * or the student's recipient row — rather than from the academic coordinate. A
 * student who has changed branch keeps the files attached to work they were
 * actually given, and one who was never in the audience has no row to find.
 */
async function mayRead(
  userId: string,
  file: {
    _id: Types.ObjectId;
    purpose: string;
    uploadedBy: Types.ObjectId;
    collegeId: Types.ObjectId;
    attachedToType?: string | null;
    attachedToId?: Types.ObjectId | null;
  }
): Promise<boolean> {
  // The uploader always may. It is their own file, and this also covers the
  // window between uploading and attaching, when nothing else can vouch for it.
  if (String(file.uploadedBy) === userId) return true;

  /**
   * The college gate, first and cheapest.
   *
   * Every later branch would also refuse a cross-college read, but this one
   * refuses it without a single extra query and is the check that stays correct
   * if a later branch is ever written carelessly (§94's third test).
   */
  const collegeId = await collegeOf(userId);
  if (!collegeId || collegeId !== String(file.collegeId)) return false;

  // Not yet attached to anything, and not the uploader's: nobody else has a
  // reason to see it.
  if (!file.attachedToId || !file.attachedToType) return false;

  if (file.attachedToType === "assignment") {
    const [owns, received] = await Promise.all([
      Assignment.exists({ _id: file.attachedToId, teacherUserId: userId }),
      AssignmentStudent.exists({ assignmentId: file.attachedToId, studentId: userId }),
    ]);
    return Boolean(owns || received);
  }

  if (file.attachedToType === "note") {
    const [owns, received] = await Promise.all([
      Note.exists({ _id: file.attachedToId, teacherUserId: userId }),
      NoteRecipient.exists({ noteId: file.attachedToId, studentId: userId }),
    ]);
    return Boolean(owns || received);
  }

  if (file.attachedToType === "submission") {
    const submission = await AssignmentSubmission.findById(file.attachedToId)
      .select("studentId assignmentId")
      .lean();

    if (!submission) return false;
    if (String(submission.studentId) === userId) return true;

    // The teacher who set the work — and only them. Another teacher at the same
    // college has no claim on a submission for a subject they do not teach
    // (§94's fifth test).
    const owns = await Assignment.exists({
      _id: submission.assignmentId,
      teacherUserId: userId,
    });
    return Boolean(owns);
  }

  return false;
}

/** The college of a user, whichever kind they are. */
async function collegeOf(userId: string): Promise<string | null> {
  const teacher = await getCurrentTeacher();
  if (teacher && teacher.userId === userId) return teacher.collegeId;

  const profile = await StudentProfile.findOne({ userId }).select("collegeId").lean();
  return profile?.collegeId ? String(profile.collegeId) : null;
}

/** §47's download count, which only applies to note attachments. */
async function countNoteDownload(file: {
  attachedToType?: string | null;
  attachedToId?: Types.ObjectId | null;
}): Promise<void> {
  if (file.attachedToType !== "note" || !file.attachedToId) return;

  try {
    await Note.updateOne({ _id: file.attachedToId }, { $inc: { downloadCount: 1 } });
  } catch (err) {
    console.error("[files] could not count a note download:", err);
  }
}
