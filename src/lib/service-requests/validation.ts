import { z } from "zod";
import {
  PRIORITIES,
  REQUEST_CATEGORIES,
  REQUEST_LIMITS,
  REQUEST_STATUSES,
} from "@/lib/service-requests/fields";

/**
 * Request shapes, at the boundary.
 *
 * `priority` is absent from the student schema on purpose: a form where everyone
 * can mark their own request urgent is a form where every request is urgent. The
 * desk sets it, and the field is unrepresentable to a student rather than merely
 * ignored.
 */

const attachment = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().min(0),
});

export const createRequestSchema = z.object({
  category: z.enum(REQUEST_CATEGORIES),
  type: z.string().trim().min(1).max(60),
  subject: z.string().trim().min(4, "Say what this is about").max(REQUEST_LIMITS.subjectMax),
  description: z
    .string()
    .trim()
    .min(10, "Add a little more detail so the desk can act on it")
    .max(REQUEST_LIMITS.descriptionMax),
  attachments: z.array(attachment).max(REQUEST_LIMITS.attachmentsMax).optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Write something").max(REQUEST_LIMITS.commentMax),
  attachments: z.array(attachment).max(REQUEST_LIMITS.attachmentsMax).optional(),
});

/** Everything the desk may change, all optional — one endpoint, several actions. */
export const adminUpdateSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignToSelf: z.boolean().optional(),
  comment: z.string().trim().max(REQUEST_LIMITS.commentMax).optional(),
  /** A note the student never sees. Defaults to visible, which is the safer way round. */
  internal: z.boolean().optional(),
  resolution: z.string().trim().max(2000).optional(),
  resolutionAttachments: z.array(attachment).max(5).optional(),
});
