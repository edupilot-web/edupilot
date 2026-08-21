import { z } from "zod";
import {
  DEGREES,
  MAX_STUDY_YEAR,
  MIN_GRADUATION_YEAR,
  MIN_STUDY_YEAR,
  ROLES,
  STUDY_STATUSES,
  maxGraduationYear,
} from "@/lib/user-fields";
import { COURSE_LEVELS } from "@/models/Course";

/**
 * Password policy, surfaced to the user as "At least 8 characters with a number"
 * on the sign-up form. Shared so the API and the sign-up action agree.
 */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200, "Use at most 200 characters")
  .regex(/[0-9]/, "Include at least one number");

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  role: z.enum(ROLES).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  /** Keeps the session cookie across browser restarts. See lib/auth.ts. */
  remember: z.boolean().optional(),
});

/**
 * Form-facing variants of the two schemas above. Every message here is written
 * to be rendered next to its field, so they read as instructions to the person
 * filling in the form rather than as API error strings.
 */
export const loginFormSchema = z.object({
  email: z.string().min(1, "Enter your email address").email("Enter a valid email address").toLowerCase(),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean(),
});

export const signupFormSchema = z
  .object({
    name: z.string().min(2, "Enter your full name").max(120, "That name is too long").trim(),
    email: z.string().min(1, "Enter your email address").email("Enter a valid email address").toLowerCase(),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    terms: z.literal(true, { error: "Accept the Terms of Service to continue" }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Optional contact details, edited from the profile screen rather than asked
 * for during onboarding. Blank is valid — an empty field must not read as an
 * error on a field nobody has to fill in.
 */
export const contactDetailsSchema = z.object({
  name: z.string().min(2, "Enter your full name").max(120, "That name is too long").trim(),
  phone: z
    .string()
    .trim()
    .max(24, "That number is too long")
    .refine((value) => value === "" || /^[+]?[\d\s()-]{7,}$/.test(value), {
      error: "Enter a valid phone number, or leave it blank",
    }),
  city: z.string().trim().max(80, "That city name is too long"),
});

/**
 * Onboarding step 1 — college, degree, specialization.
 *
 * `collegeId` is optional on purpose: a student whose college is not in the
 * directory submits a name with no id, and forcing a match would either block
 * them or push them into picking the wrong institution.
 */
export const educationStepSchema = z.object({
  collegeId: z
    .union([z.literal(""), z.string().trim().regex(/^[a-f0-9]{24}$/i)])
    .optional(),
  collegeName: z
    .string()
    .min(2, "Enter your college or university")
    .max(160, "That name is too long")
    .trim(),
  degree: z.enum(DEGREES, { error: "Choose your degree or program" }),
  specialization: z
    .string()
    .min(2, "Enter your specialization or branch")
    .max(120, "That name is too long")
    .trim(),
});

/**
 * Onboarding step 2 — current year and graduation year.
 *
 * The two fields are checked together rather than apart: a current year only
 * applies while studying, and whether a graduation year sits in the future or
 * the past is the difference between "expected" and "already happened". A flat
 * per-field schema cannot express either rule.
 */
export const academicStepSchema = z
  .object({
    studyStatus: z.enum(STUDY_STATUSES, { error: "Tell us where you are in your course" }),
    currentYear: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? Number(value) : null)),
    graduationYear: z.coerce
      .number({ error: "Choose your graduation year" })
      .int("Choose your graduation year")
      .min(MIN_GRADUATION_YEAR, "Choose your graduation year")
      .max(maxGraduationYear(), "That graduation year is too far away"),
  })
  .superRefine((values, ctx) => {
    const thisYear = new Date().getFullYear();

    if (values.studyStatus === "studying") {
      if (
        values.currentYear === null ||
        !Number.isInteger(values.currentYear) ||
        values.currentYear < MIN_STUDY_YEAR ||
        values.currentYear > MAX_STUDY_YEAR
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["currentYear"],
          message: "Choose your current year",
        });
      }
      if (values.graduationYear < thisYear) {
        ctx.addIssue({
          code: "custom",
          path: ["graduationYear"],
          message: "An expected graduation cannot be in the past",
        });
      }
    }

    if (values.studyStatus === "graduated" && values.graduationYear > thisYear) {
      ctx.addIssue({
        code: "custom",
        path: ["graduationYear"],
        message: "Choose the year you actually graduated",
      });
    }
  });

/**
 * The "wrong address?" form on the check-your-inbox screen.
 *
 * Trimmed before it is checked: an address corrected by hand is often pasted,
 * and a trailing space is a typo the user cannot see rather than a mistake
 * worth an error message.
 */
export const changeEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address")
    .email("Enter a valid email address")
    .toLowerCase(),
});

export const courseCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  level: z.enum(COURSE_LEVELS).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  price: z.number().min(0).optional(),
  coverImageUrl: z.string().url().nullish(),
  published: z.boolean().optional(),
});

export const courseUpdateSchema = courseCreateSchema.partial();

export const lessonCreateSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().optional(),
  videoUrl: z.string().url().nullish(),
  durationMinutes: z.number().min(0).optional(),
  order: z.number().int().min(0).optional(),
  isFreePreview: z.boolean().optional(),
});

export const lessonUpdateSchema = lessonCreateSchema.partial();

export const enrollSchema = z.object({
  courseId: z.string().min(1),
});

export const progressSchema = z.object({
  lessonId: z.string().min(1),
  completed: z.boolean().default(true),
});

/** Turns a title into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
