import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { StudentProfile } from "@/models/StudentProfile";
import { User } from "@/models/User";
import {
  ServiceRequest,
  ServiceRequestEvent,
  ServiceTicketCounter,
} from "@/models/ServiceRequest";
import { notify } from "@/lib/notifications/service";
import {
  CATEGORY_LABELS,
  REQUEST_LIMITS,
  STATUS_LABELS,
  canAdminTransition,
  canStudentCancel,
  formatTicket,
  isTerminal,
  isValidType,
  targetDateFor,
  TERMINAL_STATUSES,
  typeLabel,
  type Priority,
  type RequestCategory,
  type RequestStatus,
} from "@/lib/service-requests/fields";

/**
 * The help desk.
 *
 * Two audiences, one record. Everything a student sees is derived from the same
 * rows the desk works, so "what did they actually tell me" has one answer —
 * which is the question behind most complaints about a help desk.
 *
 * Two rules run through the whole file:
 *
 * 1. **A student reads and writes only their own requests.** Every query filters
 *    on `studentId` rather than checking ownership afterwards, so a forgotten
 *    check cannot leak one.
 * 2. **Internal notes are filtered in the query.** The student read paths never
 *    select an event with `internal: true`, rather than fetching and discarding
 *    them — a `.filter()` that gets refactored away is a leak; a query condition
 *    that gets refactored away is an empty list.
 */

export type AttachmentInput = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

function toAttachment(input: AttachmentInput) {
  return {
    fileId: new Types.ObjectId(input.fileId),
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
  };
}

/**
 * The next ticket for this year.
 *
 * `$inc` with `upsert` on a one-document-per-year counter. Counting existing
 * requests and adding one would hand the same number to two students who submit
 * in the same instant, and the unique index would then reject a request that was
 * perfectly valid.
 */
async function nextTicket(): Promise<string> {
  const year = new Date().getFullYear();

  const counter = await ServiceTicketCounter.findOneAndUpdate(
    { _id: year },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: "after" }
  ).lean();

  return formatTicket(year, counter?.sequence ?? 1);
}

// ── Raising one ───────────────────────────────────────────────────────────

export type CreateResult =
  | { ok: true; id: string; ticket: string }
  | { ok: false; code: string; message: string };

export async function createRequest(input: {
  studentId: string;
  category: RequestCategory;
  type: string;
  subject: string;
  description: string;
  attachments?: AttachmentInput[];
}): Promise<CreateResult> {
  await connectDB();

  if (!isValidType(input.category, input.type)) {
    return { ok: false, code: "invalid-type", message: "Choose what the request is about." };
  }

  /**
   * The college comes from the profile, not the request.
   *
   * It decides which desk sees this, so a caller that could name it could file a
   * request into another institution's queue.
   */
  const profile = await StudentProfile.findOne({ userId: input.studentId })
    .select("collegeId collegeName")
    .lean();

  if (!profile?.collegeId) {
    return {
      ok: false,
      code: "no-college",
      message: "Add your college to your profile before raising a request.",
    };
  }

  /**
   * A cap on open requests, not on requests.
   *
   * Someone with ten things genuinely outstanding is rare; someone with ten open
   * is usually someone who raised the same thing ten times because nothing
   * appeared to happen. Closing one frees a slot immediately, which a
   * per-day-only limit would not.
   */
  const open = await ServiceRequest.countDocuments({
    studentId: input.studentId,
    status: { $nin: [...TERMINAL_STATUSES] },
  });

  if (open >= REQUEST_LIMITS.openPerStudent) {
    return {
      ok: false,
      code: "too-many-open",
      message: `You already have ${open} requests open. Wait for one to be closed before raising another.`,
    };
  }

  const ticket = await nextTicket();
  const attachments = (input.attachments ?? []).slice(0, REQUEST_LIMITS.attachmentsMax);

  const request = await ServiceRequest.create({
    ticket,
    studentId: new Types.ObjectId(input.studentId),
    collegeId: profile.collegeId,
    collegeName: profile.collegeName ?? null,
    category: input.category,
    type: input.type,
    subject: input.subject.trim(),
    description: input.description.trim(),
    status: "submitted",
    attachments: attachments.map(toAttachment),
    targetAt: targetDateFor(input.category),
    // The desk has not read it yet.
    unreadForStaff: 1,
  });

  await ServiceRequestEvent.create({
    requestId: request._id,
    kind: "created",
    actorKind: "student",
    actorId: new Types.ObjectId(input.studentId),
    body: input.subject.trim(),
    toValue: "submitted",
    attachments: attachments.map(toAttachment),
  });

  return { ok: true, id: String(request._id), ticket };
}

// ── The student's view ────────────────────────────────────────────────────

export type RequestCard = {
  id: string;
  ticket: string;
  category: RequestCategory;
  categoryLabel: string;
  typeLabel: string;
  subject: string;
  status: RequestStatus;
  statusLabel: string;
  targetAt: string | null;
  /** True when the target has passed and it is still open. */
  overdue: boolean;
  unread: number;
  updatedAt: string;
  createdAt: string;
};

function toCard(row: ServiceRequestRow): RequestCard {
  const status = row.status as RequestStatus;
  return {
    id: String(row._id),
    ticket: row.ticket,
    category: row.category as RequestCategory,
    categoryLabel: CATEGORY_LABELS[row.category as RequestCategory],
    typeLabel: typeLabel(row.category as RequestCategory, row.type),
    subject: row.subject,
    status,
    statusLabel: STATUS_LABELS[status],
    targetAt: row.targetAt?.toISOString() ?? null,
    /**
     * Computed, not stored.
     *
     * Overdue is a fact about the clock, so storing it would need a job walking
     * every open request at midnight and would be wrong in between.
     */
    overdue: Boolean(row.targetAt && !isTerminal(status) && row.targetAt.getTime() < Date.now()),
    unread: row.unreadForStudent ?? 0,
    updatedAt: (row.updatedAt as Date).toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

type ServiceRequestRow = {
  _id: Types.ObjectId;
  ticket: string;
  category: string;
  type: string;
  subject: string;
  status: string;
  targetAt?: Date | null;
  unreadForStudent?: number;
  updatedAt: Date;
  createdAt: Date;
};

export type StudentFilter = "open" | "closed" | "all";

export async function listForStudent(
  studentId: string,
  options: { filter?: StudentFilter; limit?: number } = {}
): Promise<{ cards: RequestCard[]; counts: { open: number; closed: number; all: number } }> {
  await connectDB();

  // `TERMINAL_STATUSES` rather than a literal list: "closed" is defined once,
  // in the vocabulary, so a status added later cannot be closed in one query
  // and open in the next.
  const closed = [...TERMINAL_STATUSES];
  const filter: Record<string, unknown> = { studentId };

  if (options.filter === "open") filter.status = { $nin: closed };
  if (options.filter === "closed") filter.status = { $in: closed };

  const [rows, open, closedCount, all] = await Promise.all([
    ServiceRequest.find(filter)
      .sort({ updatedAt: -1 })
      .limit(Math.min(options.limit ?? 50, 100))
      .lean(),
    ServiceRequest.countDocuments({ studentId, status: { $nin: closed } }),
    ServiceRequest.countDocuments({ studentId, status: { $in: closed } }),
    ServiceRequest.countDocuments({ studentId }),
  ]);

  return {
    cards: (rows as unknown as ServiceRequestRow[]).map(toCard),
    counts: { open, closed: closedCount, all },
  };
}

export type TimelineEntry = {
  id: string;
  kind: string;
  actorKind: "student" | "staff" | "system";
  actorName: string | null;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  attachments: { fileId: string; fileName: string; size: number }[];
  createdAt: string;
};

export type RequestDetail = RequestCard & {
  description: string;
  priority: Priority;
  attachments: { fileId: string; fileName: string; size: number }[];
  resolution: string | null;
  resolutionAttachments: { fileId: string; fileName: string; size: number }[];
  assignedToName: string | null;
  canCancel: boolean;
  timeline: TimelineEntry[];
};

export async function getForStudent(
  studentId: string,
  requestId: string
): Promise<RequestDetail | null> {
  await connectDB();
  if (!Types.ObjectId.isValid(requestId)) return null;

  /**
   * Scoped in the query, not checked afterwards.
   *
   * Another student's request simply does not resolve, so "not yours" and "does
   * not exist" are the same answer — which stops an id being probed to learn
   * what anyone else has asked for.
   */
  const row = await ServiceRequest.findOne({ _id: requestId, studentId }).lean();
  if (!row) return null;

  const events = await ServiceRequestEvent.find({
    requestId: row._id,
    // The filter is the guarantee. See the note at the top of this file.
    internal: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .lean();

  // Opening it clears the student's unread count.
  if ((row.unreadForStudent ?? 0) > 0) {
    await ServiceRequest.updateOne({ _id: row._id }, { $set: { unreadForStudent: 0 } });
  }

  const card = toCard(row as unknown as ServiceRequestRow);

  return {
    ...card,
    unread: 0,
    description: row.description,
    priority: row.priority as Priority,
    attachments: mapFiles(row.attachments),
    resolution: row.resolution ?? null,
    resolutionAttachments: mapFiles(row.resolutionAttachments),
    assignedToName: row.assignedToName ?? null,
    canCancel: canStudentCancel(row.status as RequestStatus),
    timeline: events.map((event) => ({
      id: String(event._id),
      kind: event.kind,
      actorKind: event.actorKind as "student" | "staff" | "system",
      /**
       * Staff are shown as "the desk", not by name.
       *
       * A student does not need to know which clerk declined their request, and
       * naming them is how one person becomes the target of a complaint about a
       * decision the institution made.
       */
      actorName: event.actorKind === "staff" ? "EduPilot support" : event.actorName ?? null,
      body: event.body ?? null,
      fromValue: event.fromValue ?? null,
      toValue: event.toValue ?? null,
      attachments: mapFiles(event.attachments),
      createdAt: (event.createdAt as Date).toISOString(),
    })),
  };
}

function mapFiles(
  files: { fileId: Types.ObjectId; fileName: string; size: number }[] | undefined
): { fileId: string; fileName: string; size: number }[] {
  return (files ?? []).map((file) => ({
    fileId: String(file.fileId),
    fileName: file.fileName,
    size: file.size,
  }));
}

// ── The student acting ────────────────────────────────────────────────────

export type ActionResult = { ok: true } | { ok: false; code: string; message: string };

export async function addStudentComment(input: {
  studentId: string;
  requestId: string;
  body: string;
  attachments?: AttachmentInput[];
}): Promise<ActionResult> {
  await connectDB();
  if (!Types.ObjectId.isValid(input.requestId)) {
    return { ok: false, code: "not-found", message: "That request does not exist." };
  }

  const request = await ServiceRequest.findOne({
    _id: input.requestId,
    studentId: input.studentId,
  });
  if (!request) return { ok: false, code: "not-found", message: "That request does not exist." };

  if (isTerminal(request.status as RequestStatus)) {
    return {
      ok: false,
      code: "closed",
      message: "This request is closed. Raise a new one if you still need help.",
    };
  }

  const name = await studentName(input.studentId);
  const attachments = (input.attachments ?? []).slice(0, REQUEST_LIMITS.attachmentsMax);

  await ServiceRequestEvent.create({
    requestId: request._id,
    kind: "comment",
    actorKind: "student",
    actorId: new Types.ObjectId(input.studentId),
    actorName: name,
    body: input.body.trim(),
    attachments: attachments.map(toAttachment),
  });

  /**
   * A reply moves it off "waiting on you" by itself.
   *
   * The desk asked a question and got an answer; leaving it parked there would
   * mean somebody has to notice and change it by hand, and until they do it sits
   * in a state that says the ball is with the student when it is not.
   */
  const wasWaiting = request.status === "awaiting_student";

  await ServiceRequest.updateOne(
    { _id: request._id },
    {
      $inc: { unreadForStaff: 1 },
      ...(wasWaiting ? { $set: { status: "in_progress" } } : {}),
    }
  );

  if (wasWaiting) {
    await ServiceRequestEvent.create({
      requestId: request._id,
      kind: "status_changed",
      actorKind: "system",
      fromValue: "awaiting_student",
      toValue: "in_progress",
      body: "The student replied.",
    });
  }

  return { ok: true };
}

export async function cancelRequest(studentId: string, requestId: string): Promise<ActionResult> {
  await connectDB();
  if (!Types.ObjectId.isValid(requestId)) {
    return { ok: false, code: "not-found", message: "That request does not exist." };
  }

  /**
   * The status is part of the filter.
   *
   * "Is it still open" and "close it" are one atomic operation, so a cancel that
   * races the desk resolving it cannot overwrite the resolution.
   */
  const updated = await ServiceRequest.findOneAndUpdate(
    { _id: requestId, studentId, status: { $nin: [...TERMINAL_STATUSES] } },
    { $set: { status: "cancelled", closedAt: new Date() }, $inc: { unreadForStaff: 1 } },
    { returnDocument: "after" }
  );

  if (!updated) {
    const exists = await ServiceRequest.exists({ _id: requestId, studentId });
    return exists
      ? { ok: false, code: "closed", message: "This request has already been closed." }
      : { ok: false, code: "not-found", message: "That request does not exist." };
  }

  await ServiceRequestEvent.create({
    requestId: updated._id,
    kind: "status_changed",
    actorKind: "student",
    actorId: new Types.ObjectId(studentId),
    toValue: "cancelled",
    body: "Cancelled by the student.",
  });

  return { ok: true };
}

async function studentName(userId: string): Promise<string | null> {
  const user = await User.findById(userId).select("name").lean();
  return user?.name ?? null;
}

// ── The desk acting ───────────────────────────────────────────────────────

export async function transitionRequest(input: {
  requestId: string;
  admin: { id: string; name: string; collegeId: string | null };
  to?: RequestStatus;
  priority?: Priority;
  assignToSelf?: boolean;
  comment?: string;
  internal?: boolean;
  resolution?: string;
  resolutionAttachments?: AttachmentInput[];
}): Promise<ActionResult> {
  await connectDB();
  if (!Types.ObjectId.isValid(input.requestId)) {
    return { ok: false, code: "not-found", message: "That request does not exist." };
  }

  /**
   * Scoped to the administrator's college when they have one.
   *
   * The scope comes from their own record; there is no parameter that widens it,
   * so a college admin cannot express "show me another institution's requests"
   * and a platform admin does not have to.
   */
  const scope: Record<string, unknown> = { _id: input.requestId };
  if (input.admin.collegeId) scope.collegeId = new Types.ObjectId(input.admin.collegeId);

  const request = await ServiceRequest.findOne(scope);
  if (!request) return { ok: false, code: "not-found", message: "That request does not exist." };

  const from = request.status as RequestStatus;
  const set: Record<string, unknown> = {};
  const events: Parameters<typeof ServiceRequestEvent.create>[0][] = [];

  if (input.assignToSelf && String(request.assignedToAdminId ?? "") !== input.admin.id) {
    set.assignedToAdminId = new Types.ObjectId(input.admin.id);
    set.assignedToName = input.admin.name;
    events.push({
      requestId: request._id,
      kind: "assigned",
      actorKind: "staff",
      actorId: new Types.ObjectId(input.admin.id),
      actorName: input.admin.name,
      toValue: input.admin.name,
      /** Internal: the student is shown "the desk", never which clerk. */
      internal: true,
    });
  }

  if (input.priority && input.priority !== request.priority) {
    set.priority = input.priority;
    events.push({
      requestId: request._id,
      kind: "priority_changed",
      actorKind: "staff",
      actorId: new Types.ObjectId(input.admin.id),
      actorName: input.admin.name,
      fromValue: request.priority,
      toValue: input.priority,
      internal: true,
    });
  }

  if (input.comment?.trim()) {
    events.push({
      requestId: request._id,
      kind: "comment",
      actorKind: "staff",
      actorId: new Types.ObjectId(input.admin.id),
      actorName: input.admin.name,
      body: input.comment.trim(),
      internal: input.internal === true,
    });
  }

  if (input.to && input.to !== from) {
    if (!canAdminTransition(from, input.to)) {
      return {
        ok: false,
        code: "bad-transition",
        message: `A ${STATUS_LABELS[from].toLowerCase()} request cannot become ${STATUS_LABELS[input.to].toLowerCase()}.`,
      };
    }

    /**
     * A decline must say why.
     *
     * A rejected request with no reason is the single most common cause of a
     * student raising the same request again a week later.
     */
    if (input.to === "rejected" && !input.resolution?.trim()) {
      return {
        ok: false,
        code: "reason-required",
        message: "Say why this is being declined. The student sees it.",
      };
    }

    set.status = input.to;
    if (isTerminal(input.to)) set.closedAt = new Date();
    if (input.resolution?.trim()) set.resolution = input.resolution.trim();
    if (input.resolutionAttachments?.length) {
      set.resolutionAttachments = input.resolutionAttachments.slice(0, 5).map(toAttachment);
    }

    events.push({
      requestId: request._id,
      kind: input.to === "resolved" ? "resolved" : "status_changed",
      actorKind: "staff",
      actorId: new Types.ObjectId(input.admin.id),
      actorName: input.admin.name,
      fromValue: from,
      toValue: input.to,
      body: input.resolution?.trim() || null,
      attachments: (input.resolutionAttachments ?? []).slice(0, 5).map(toAttachment),
    });
  }

  if (!request.firstResponseAt) set.firstResponseAt = new Date();

  // The desk has now looked at it. Set before the update is assembled rather
  // than after, so the write does not depend on `set` being mutated by
  // reference further down.
  set.unreadForStaff = 0;

  // Anything the student can see raises their unread count. An internal note or
  // a priority bump is the desk organising itself and must not.
  const studentVisible = events.some((event) => !event.internal);

  await ServiceRequest.updateOne(
    { _id: request._id },
    { $set: set, ...(studentVisible ? { $inc: { unreadForStudent: 1 } } : {}) }
  );
  if (events.length) await ServiceRequestEvent.insertMany(events);

  if (studentVisible) {
    await notifyStudent(request, input.to ?? from, input.resolution ?? null);
  }

  return { ok: true };
}

/**
 * Tell the student, when there is something worth telling them.
 *
 * Only on a status change or a visible comment — an internal note or a priority
 * bump is the desk organising itself, and notifying on it would train students
 * to ignore the ones that matter.
 */
async function notifyStudent(
  request: { _id: Types.ObjectId; studentId: Types.ObjectId; ticket: string; subject: string },
  status: RequestStatus,
  reason: string | null
): Promise<void> {
  const type =
    status === "resolved" || status === "rejected"
      ? "SERVICE_REQUEST_RESOLVED"
      : status === "awaiting_student"
        ? "SERVICE_REQUEST_NEEDS_YOU"
        : "SERVICE_REQUEST_UPDATED";

  await notify({
    recipientIds: [String(request.studentId)],
    type,
    entityType: "service_request",
    entityId: String(request._id),
    data: {
      title: request.subject,
      ticket: request.ticket,
      statusLabel: STATUS_LABELS[status],
      reason,
    },
  });
}
