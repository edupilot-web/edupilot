import { z } from "zod";
import { ROLES } from "@/models/User";
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
