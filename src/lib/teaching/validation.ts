import { z } from "zod";
import { SUBMISSION_TYPES } from "@/lib/teaching/fields";

/**
 * Request schemas for the teaching module (§84).
 *
 * Separate from `lib/validation.ts` — which holds the auth and onboarding
 * schemas — because these are read by teacher forms and student forms alike and
 * that file is already the longest in the project. What they share is the
 * approach: a zod schema at the boundary, so a route never hand-inspects a
 * request body and never has to remember which fields were optional.
 *
 * **No schema here accepts an academic id other than `subjectId`.** That is the
 * enforcement of §10 and §77 at the type level rather than in a comment: a
 * college, programme, branch or regulation id in a request body would not be
 * rejected, it would be *unrepresentable*, because the services take those from
 * the authorised subject.
 */

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, "That is not a valid id");

/** An id that may be absent, and where an empty string means absent. */
const optionalObjectId = z
  .union([z.literal(""), objectId])
  .nullish()
  .transform((value) => (value ? value : null));

/**
 * A date arriving as an ISO string.
 *
 * `z.coerce.date()` would accept `"banana"` as an Invalid Date and hand it
 * downstream, where it becomes a null in Mongo and a deadline nobody set. This
 * refuses it.
 */
const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "That is not a valid date")
  .transform((value) => new Date(value));

const optionalDate = z
  .union([z.literal(""), isoDate])
  .nullish()
  .transform((value) => (value instanceof Date ? value : null));

const attachment = z.object({
  fileId: objectId,
  fileName: z.string().min(1).max(260),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().min(0),
});

// ── Teacher account (§3) ──────────────────────────────────────────────────

export const teacherSignupSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(120, "That name is too long"),
    email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address").toLowerCase(),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(200, "Use at most 200 characters")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Confirm your password"),
    /**
     * Required, and an id rather than a name (§3).
     *
     * Free text would put "ABC Engg. College" and "ABC Engineering College" in
     * the directory as two institutions and leave the audience resolver unable
     * to match either against a student.
     */
    collegeId: objectId,
    departmentId: optionalObjectId,
    employeeId: z.string().trim().max(40).nullish(),
    designation: z.string().trim().max(80).nullish(),
    phone: z.string().trim().max(24).nullish(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const teacherLoginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address").toLowerCase(),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean().optional(),
});

export const teacherProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  departmentId: optionalObjectId,
  employeeId: z.string().trim().max(40).nullish(),
  designation: z.string().trim().max(80).nullish(),
  phone: z.string().trim().max(24).nullish(),
});

// ── Assignments (§14) ─────────────────────────────────────────────────────

export const assignmentCreateSchema = z.object({
  subjectId: objectId,
  topicId: optionalObjectId,
  title: z.string().trim().min(3, "Give the assignment a title").max(200),
  description: z.string().max(5000).nullish(),
  instructions: z.string().max(20000).nullish(),
  submissionType: z.enum(SUBMISSION_TYPES).default("text"),
  maxMarks: z.number().min(0).max(1000).nullish(),
  dueAt: optionalDate,
  allowLateSubmission: z.boolean().optional(),
  lateSubmissionUntil: optionalDate,
  attachments: z.array(attachment).max(10).optional(),
});

/**
 * The edit schema, with `subjectId` deliberately absent.
 *
 * Re-pointing published work at a different subject would leave every
 * `AssignmentStudent` row for an audience that no longer matches, and the
 * students holding them with no explanation. Making the field unrepresentable
 * is stronger than checking for it.
 */
export const assignmentUpdateSchema = assignmentCreateSchema
  .omit({ subjectId: true })
  .partial();

export const submissionSchema = z.object({
  content: z.string().max(50000).nullish(),
  language: z.string().trim().max(40).nullish(),
  links: z.array(z.string().trim().url("Enter a valid link").max(2000)).max(10).optional(),
  attachments: z.array(attachment).max(5).optional(),
});

export const gradeSchema = z.object({
  marks: z.number().min(0).max(1000).nullable(),
  feedback: z.string().max(4000).nullish(),
});

// ── Notes (§29) ───────────────────────────────────────────────────────────

export const noteCreateSchema = z.object({
  subjectId: objectId,
  topicId: optionalObjectId,
  title: z.string().trim().min(3, "Give these notes a title").max(200),
  description: z.string().max(5000).nullish(),
  content: z.string().max(50000).nullish(),
  attachments: z.array(attachment).max(10).optional(),
  externalLinks: z
    .array(
      z.object({
        label: z.string().trim().max(200).nullish(),
        url: z.string().trim().url("Enter a valid link").max(2000),
      })
    )
    .max(10)
    .optional(),
});

export const noteUpdateSchema = noteCreateSchema.omit({ subjectId: true }).partial();

// ── Admin: teacher management (§56, §57) ──────────────────────────────────

export const teacherStatusSchema = z.object({
  status: z.enum(["active", "suspended", "rejected", "deactivated", "pending"]),
  /** Required by the route for a rejection or a suspension, not by the schema. */
  reason: z.string().trim().max(1000).nullish(),
});

export const teacherSubjectAssignSchema = z.object({
  subjectId: objectId,
  admissionYear: z.number().int().min(1980).max(2100).nullish(),
});

// ── Notifications (§40) ───────────────────────────────────────────────────

export const notificationPreferenceSchema = z.object({
  channels: z
    .record(
      z.string(),
      z.record(z.string(), z.boolean())
    )
    .optional(),
  mutedUntil: optionalDate,
});
