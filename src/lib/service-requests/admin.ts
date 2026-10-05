import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { ServiceRequest, ServiceRequestEvent } from "@/models/ServiceRequest";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  ADMIN_TRANSITIONS,
  TERMINAL_STATUSES,
  isTerminal,
  typeLabel,
  type Priority,
  type RequestCategory,
  type RequestStatus,
} from "@/lib/service-requests/fields";

/**
 * The desk's view of the queue.
 *
 * Separate from `service.ts`, which holds the writes. Reading a queue is a
 * different problem from moving a request through one — this file is joins and
 * sorting, that one is invariants.
 *
 * Every query here is scoped to the administrator's college when they have one.
 * The scope comes from their own record and there is no parameter that widens
 * it, so a college admin cannot express "show me another institution's requests"
 * and a platform admin does not have to.
 */

export type QueueRow = {
  id: string;
  ticket: string;
  studentName: string | null;
  studentEmail: string | null;
  collegeName: string | null;
  category: RequestCategory;
  categoryLabel: string;
  typeLabel: string;
  subject: string;
  status: RequestStatus;
  statusLabel: string;
  priority: Priority;
  assignedToName: string | null;
  targetAt: string | null;
  overdue: boolean;
  unreadForStaff: number;
  createdAt: string;
  updatedAt: string;
};

export type QueueFilter = "open" | "unassigned" | "mine" | "overdue" | "closed" | "all";

export async function listQueue(
  admin: { id: string; collegeId: string | null },
  options: {
    filter?: QueueFilter;
    category?: string | null;
    search?: string | null;
    limit?: number;
    skip?: number;
  } = {}
): Promise<{
  rows: QueueRow[];
  total: number;
  counts: { open: number; unassigned: number; mine: number; overdue: number };
}> {
  await connectDB();

  const base: Record<string, unknown> = {};
  if (admin.collegeId) base.collegeId = new Types.ObjectId(admin.collegeId);

  const open = { $nin: [...TERMINAL_STATUSES] };
  const filter: Record<string, unknown> = { ...base };

  switch (options.filter ?? "open") {
    case "open":
      filter.status = open;
      break;
    case "unassigned":
      filter.status = open;
      filter.assignedToAdminId = null;
      break;
    case "mine":
      filter.status = open;
      filter.assignedToAdminId = new Types.ObjectId(admin.id);
      break;
    case "overdue":
      filter.status = open;
      filter.targetAt = { $lt: new Date() };
      break;
    case "closed":
      filter.status = { $in: [...TERMINAL_STATUSES] };
      break;
    // "all" adds nothing.
  }

  if (options.category) filter.category = options.category;

  /**
   * A search resolves to student ids first, then matches the ticket directly.
   *
   * The request carries no student name — denormalising one would mean a row
   * whose label goes stale the moment somebody changes their name, on the
   * collection that has to stay truthful longest. A ticket search is the common
   * case (somebody is holding a reference number) so it is checked without a
   * join at all.
   */
  if (options.search?.trim()) {
    const term = options.search.trim();
    const pattern = new RegExp(escapeRegex(term), "i");

    const users = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .select("_id")
      .limit(200)
      .lean();

    filter.$or = [{ ticket: pattern }, { studentId: { $in: users.map((user) => user._id) } }];
  }

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);

  const [rows, total, openCount, unassigned, mine, overdue] = await Promise.all([
    ServiceRequest.find(filter)
      /**
       * Overdue first, then by target.
       *
       * Not "oldest first", which buries a one-day IT problem behind a stack of
       * week-long document requests. The target date already encodes how long
       * each kind is allowed to take, so sorting by it is sorting by urgency.
       */
      .sort({ targetAt: 1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ServiceRequest.countDocuments(filter),
    ServiceRequest.countDocuments({ ...base, status: open }),
    ServiceRequest.countDocuments({ ...base, status: open, assignedToAdminId: null }),
    ServiceRequest.countDocuments({
      ...base,
      status: open,
      assignedToAdminId: new Types.ObjectId(admin.id),
    }),
    ServiceRequest.countDocuments({ ...base, status: open, targetAt: { $lt: new Date() } }),
  ]);

  const students = await User.find({ _id: { $in: rows.map((row) => row.studentId) } })
    .select("name email")
    .lean();
  const byId = new Map(students.map((student) => [String(student._id), student]));

  return {
    rows: rows.map((row) => {
      const student = byId.get(String(row.studentId));
      const status = row.status as RequestStatus;

      return {
        id: String(row._id),
        ticket: row.ticket,
        studentName: student?.name ?? null,
        studentEmail: student?.email ?? null,
        collegeName: row.collegeName ?? null,
        category: row.category as RequestCategory,
        categoryLabel: CATEGORY_LABELS[row.category as RequestCategory],
        typeLabel: typeLabel(row.category as RequestCategory, row.type),
        subject: row.subject,
        status,
        statusLabel: STATUS_LABELS[status],
        priority: row.priority as Priority,
        assignedToName: row.assignedToName ?? null,
        targetAt: row.targetAt?.toISOString() ?? null,
        overdue: Boolean(
          row.targetAt && !isTerminal(status) && row.targetAt.getTime() < Date.now()
        ),
        unreadForStaff: row.unreadForStaff ?? 0,
        createdAt: (row.createdAt as Date).toISOString(),
        updatedAt: (row.updatedAt as Date).toISOString(),
      };
    }),
    total,
    counts: { open: openCount, unassigned, mine, overdue },
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type AdminRequestDetail = QueueRow & {
  description: string;
  attachments: { fileId: string; fileName: string; size: number }[];
  resolution: string | null;
  resolutionAttachments: { fileId: string; fileName: string; size: number }[];
  /** What this request may become next, from the transition table. */
  nextStatuses: { key: RequestStatus; label: string }[];
  timeline: {
    id: string;
    kind: string;
    actorKind: string;
    actorName: string | null;
    body: string | null;
    fromValue: string | null;
    toValue: string | null;
    attachments: { fileId: string; fileName: string; size: number }[];
    internal: boolean;
    createdAt: string;
  }[];
};

export async function getForAdmin(
  admin: { id: string; collegeId: string | null },
  requestId: string
): Promise<AdminRequestDetail | null> {
  await connectDB();
  if (!Types.ObjectId.isValid(requestId)) return null;

  const scope: Record<string, unknown> = { _id: requestId };
  if (admin.collegeId) scope.collegeId = new Types.ObjectId(admin.collegeId);

  const row = await ServiceRequest.findOne(scope).lean();
  if (!row) return null;

  const [student, events] = await Promise.all([
    User.findById(row.studentId).select("name email").lean(),
    // The desk sees everything, internal notes included — that is the whole
    // point of having them.
    ServiceRequestEvent.find({ requestId: row._id }).sort({ createdAt: 1 }).lean(),
  ]);

  // Opening it clears the desk's unread marker.
  if ((row.unreadForStaff ?? 0) > 0) {
    await ServiceRequest.updateOne({ _id: row._id }, { $set: { unreadForStaff: 0 } });
  }

  const status = row.status as RequestStatus;

  return {
    id: String(row._id),
    ticket: row.ticket,
    studentName: student?.name ?? null,
    studentEmail: student?.email ?? null,
    collegeName: row.collegeName ?? null,
    category: row.category as RequestCategory,
    categoryLabel: CATEGORY_LABELS[row.category as RequestCategory],
    typeLabel: typeLabel(row.category as RequestCategory, row.type),
    subject: row.subject,
    status,
    statusLabel: STATUS_LABELS[status],
    priority: row.priority as Priority,
    assignedToName: row.assignedToName ?? null,
    targetAt: row.targetAt?.toISOString() ?? null,
    overdue: Boolean(row.targetAt && !isTerminal(status) && row.targetAt.getTime() < Date.now()),
    unreadForStaff: 0,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
    description: row.description,
    attachments: mapFiles(row.attachments),
    resolution: row.resolution ?? null,
    resolutionAttachments: mapFiles(row.resolutionAttachments),
    /**
     * Generated from the same table the server checks.
     *
     * A screen that offered a button the server would refuse is how a queue
     * teaches its users not to trust it.
     */
    nextStatuses: (ADMIN_TRANSITIONS[status] ?? []).map((key) => ({
      key,
      label: STATUS_LABELS[key],
    })),
    timeline: events.map((event) => ({
      id: String(event._id),
      kind: event.kind,
      actorKind: event.actorKind,
      actorName: event.actorName ?? null,
      body: event.body ?? null,
      fromValue: event.fromValue ?? null,
      toValue: event.toValue ?? null,
      attachments: mapFiles(event.attachments),
      internal: event.internal === true,
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
