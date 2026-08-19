import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Course } from "@/models/Course";
import { courseCreateSchema, slugify } from "@/lib/validation";
import { ok, handleError, requireRole } from "@/lib/api";

/** GET /api/courses — public catalogue with search, filter, pagination. */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 12)));
    const q = searchParams.get("q")?.trim();
    const level = searchParams.get("level");
    const tag = searchParams.get("tag");

    const filter: Record<string, unknown> = { published: true };
    if (q) filter.$text = { $search: q };
    if (level) filter.level = level;
    if (tag) filter.tags = tag;

    const [items, total] = await Promise.all([
      Course.find(filter)
        .populate("instructor", "name email avatarUrl")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Course.countDocuments(filter),
    ]);

    return ok({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/courses — instructors and admins create courses. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("instructor", "admin");
    await connectDB();
    const body = courseCreateSchema.parse(await req.json());

    // Slugs are unique, so append a suffix when the title collides.
    const base = slugify(body.title);
    let slug = base;
    for (let i = 2; await Course.exists({ slug }); i++) {
      slug = `${base}-${i}`;
    }

    const course = await Course.create({
      ...body,
      slug,
      instructor: session.sub,
    });

    return ok({ course }, 201);
  } catch (err) {
    return handleError(err);
  }
}
