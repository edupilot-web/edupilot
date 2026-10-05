import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  PRIORITIES,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  REQUEST_LIMITS,
} from "@/lib/service-requests/fields";

/**
 * A campus help-desk request, and its timeline.
 *
 * Two collections, for the same reason assignments and their submissions are
 * two: the request is a row that changes, and the timeline is a record of *how*
 * it changed. Folding the second into an array on the first would mean a
 * document that grows without bound and a history that an `$set` can silently
 * rewrite.
 *
 * `ServiceRequestEvent` is append-only. Nothing edits or deletes an event; a
 * correction is another event. That is what makes "who changed this to
 * rejected, and when" answerable — which is the question that gets asked when a
 * student says nobody told them.
 */

const attachmentSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "StoredFile", required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const serviceRequestSchema = new Schema(
  {
    /**
     * The human reference: `SR-2026-00042`.
     *
     * Unique, because it is quoted at a counter and typed into a search box. An
     * ObjectId cannot be read aloud reliably, and the first mistake sends the
     * desk to the wrong row.
     */
    ticket: { type: String, required: true, unique: true },

    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /**
     * Denormalised from the student's profile at creation.
     *
     * The request belongs to the college the student was at when they raised it.
     * Resolving it live would move a graduate's old request into whatever
     * college their profile points at now, and would make the admin queue's
     * scope depend on a join that can change underneath it.
     */
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    collegeName: { type: String, default: null, maxlength: 200 },

    category: { type: String, enum: REQUEST_CATEGORIES, required: true, index: true },
    /** A key from `REQUEST_TYPES[category]`. Validated by the service. */
    type: { type: String, required: true, maxlength: 60 },

    subject: { type: String, required: true, trim: true, maxlength: REQUEST_LIMITS.subjectMax },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: REQUEST_LIMITS.descriptionMax,
    },

    status: { type: String, enum: REQUEST_STATUSES, default: "submitted", index: true },

    /**
     * Set by the desk, never by the student.
     *
     * A form where everyone can mark their own request urgent is a form where
     * every request is urgent, and the field stops meaning anything.
     */
    priority: { type: String, enum: PRIORITIES, default: "normal", index: true },

    attachments: { type: [attachmentSchema], default: [] },

    /** Whoever has picked it up. Null while it sits in the queue. */
    assignedToAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
    assignedToName: { type: String, default: null, maxlength: 200 },

    /**
     * What the desk did, shown to the student on a terminal status.
     *
     * Required by the service for `rejected`: a declined request with no reason
     * is the single most common cause of the student coming back to ask why.
     */
    resolution: { type: String, default: null, maxlength: 2000 },

    /**
     * Files the desk produced — the issued certificate, the signed letter.
     *
     * The natural completion of a document request, and the reason this reuses
     * `StoredFile` rather than inventing its own storage: the permission-checked
     * download route already exists and already refuses anyone who is not
     * entitled.
     */
    resolutionAttachments: { type: [attachmentSchema], default: [] },

    /** When the desk aims to have finished. A target, not a promise. */
    targetAt: { type: Date, default: null, index: true },

    firstResponseAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    /**
     * Unread counters, one per side.
     *
     * Denormalised because both lists render a dot per row, and computing it
     * would mean a count query per request on every page load.
     */
    unreadForStudent: { type: Number, default: 0, min: 0 },
    unreadForStaff: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

/** The student's list, newest first. */
serviceRequestSchema.index({ studentId: 1, createdAt: -1 });
/** The desk's queue: one college, filtered by state, oldest target first. */
serviceRequestSchema.index({ collegeId: 1, status: 1, targetAt: 1 });
/** "What is assigned to me." */
serviceRequestSchema.index({ assignedToAdminId: 1, status: 1 });

export type ServiceRequestDoc = InferSchemaType<typeof serviceRequestSchema>;

resetModelInDev("ServiceRequest");

export const ServiceRequest: Model<ServiceRequestDoc> =
  (mongoose.models.ServiceRequest as Model<ServiceRequestDoc>) ||
  mongoose.model<ServiceRequestDoc>("ServiceRequest", serviceRequestSchema);

// ── Timeline ──────────────────────────────────────────────────────────────

export const EVENT_KINDS = [
  "created",
  "comment",
  "status_changed",
  "assigned",
  "priority_changed",
  "attachment_added",
  "resolved",
] as const;

const serviceRequestEventSchema = new Schema(
  {
    requestId: { type: Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },

    kind: { type: String, enum: EVENT_KINDS, required: true },

    /** `student`, `staff`, or `system` for anything nobody did by hand. */
    actorKind: { type: String, enum: ["student", "staff", "system"], required: true },
    actorId: { type: Schema.Types.ObjectId, default: null },
    actorName: { type: String, default: null, maxlength: 200 },

    body: { type: String, default: null, maxlength: REQUEST_LIMITS.commentMax },

    /** For `status_changed` and `priority_changed`. */
    fromValue: { type: String, default: null, maxlength: 60 },
    toValue: { type: String, default: null, maxlength: 60 },

    attachments: { type: [attachmentSchema], default: [] },

    /**
     * A note the student never sees.
     *
     * The desk needs somewhere to write "spoke to the registrar, waiting on
     * their sign-off" without it reading as a reply. Without an internal option
     * that note goes in a spreadsheet instead, and the request stops being the
     * record of itself.
     *
     * Every read path filters on this, and the student's API never selects a
     * row where it is true — the filter is in the query rather than applied
     * after, so a forgotten `.filter()` cannot leak one.
     */
    internal: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/** The timeline, oldest first. */
serviceRequestEventSchema.index({ requestId: 1, createdAt: 1 });

export type ServiceRequestEventDoc = InferSchemaType<typeof serviceRequestEventSchema>;

resetModelInDev("ServiceRequestEvent");

export const ServiceRequestEvent: Model<ServiceRequestEventDoc> =
  (mongoose.models.ServiceRequestEvent as Model<ServiceRequestEventDoc>) ||
  mongoose.model<ServiceRequestEventDoc>("ServiceRequestEvent", serviceRequestEventSchema);

// ── Ticket numbering ──────────────────────────────────────────────────────

const ticketCounterSchema = new Schema(
  {
    /** The calendar year the sequence belongs to. */
    _id: { type: Number, required: true },
    sequence: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

/**
 * One row per year, incremented atomically.
 *
 * `$inc` on a single document is the only way to get a gapless sequence without
 * a transaction. Counting existing requests and adding one would hand the same
 * number to two students who submit in the same instant — and the unique index
 * on `ticket` would then reject one of them, losing a request that was
 * perfectly valid.
 */
resetModelInDev("ServiceTicketCounter");

export const ServiceTicketCounter: Model<InferSchemaType<typeof ticketCounterSchema>> =
  (mongoose.models.ServiceTicketCounter as Model<InferSchemaType<typeof ticketCounterSchema>>) ||
  mongoose.model("ServiceTicketCounter", ticketCounterSchema);
