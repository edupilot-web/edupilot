import { z } from "zod";
import { ROLES } from "@/models/User";
import { COURSE_LEVELS } from "@/models/Course";

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
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
