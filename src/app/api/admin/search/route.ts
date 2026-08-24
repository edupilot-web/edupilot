import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin/current-admin";
import { hasPermission } from "@/lib/admin/permissions";
import { maskEmail } from "@/lib/admin/format";
import { containsRegex } from "@/lib/admin/query";
import { College } from "@/models/College";
import { University } from "@/models/University";
import { User } from "@/models/User";
import { AdminUser } from "@/models/AdminUser";

/**
 * Global search for the command palette (spec §31).
 *
 * Searches only the collections the caller may read, and masks what they may
 * not see — a palette that surfaces a student's email address to an admin whose
 * role hides it in the table would be a hole straight through the permission.
 *
 * Each collection is capped low and queried in parallel. The palette is a
 * navigation aid: it wants five good answers quickly, not fifty.
 */
const PER_TYPE = 5;
const MIN_QUERY = 2;

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return Response.json({ error: { message: "Authentication required" } }, { status: 401 });
  }

  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < MIN_QUERY) return Response.json({ data: { results: [] } });

  try {
    await connectDB();
    const term = containsRegex(query);

    const canSeeStudents = hasPermission(admin.permissions, "student.view");
    const canSeePii = hasPermission(admin.permissions, "student.view_pii");
    const canSeeAdmins = hasPermission(admin.permissions, "admin.view");

    const [colleges, universities, students, admins] = await Promise.all([
      hasPermission(admin.permissions, "college.view")
        ? College.find({ $or: [{ name: term }, { code: term }, { cityName: term }] })
            .select("name code districtName stateName")
            .limit(PER_TYPE)
            .lean()
        : Promise.resolve([]),
      hasPermission(admin.permissions, "university.view")
        ? University.find({ $or: [{ name: term }, { shortName: term }, { code: term }] })
            .select("name shortName stateName")
            .limit(PER_TYPE)
            .lean()
        : Promise.resolve([]),
      canSeeStudents
        ? User.find({ role: "student", $or: [{ name: term }, { email: term }] })
            .select("name email")
            .limit(PER_TYPE)
            .lean()
        : Promise.resolve([]),
      canSeeAdmins
        ? AdminUser.find({ $or: [{ name: term }, { email: term }] })
            .select("name email roleName")
            .limit(PER_TYPE)
            .lean()
        : Promise.resolve([]),
    ]);

    const results = [
      ...colleges.map((row) => ({
        id: String(row._id),
        type: "Colleges",
        title: row.name,
        subtitle: [row.code, row.districtName, row.stateName].filter(Boolean).join(" · ") || null,
        href: `/admin/colleges/${row._id}`,
      })),
      ...universities.map((row) => ({
        id: String(row._id),
        type: "Universities",
        title: row.name,
        subtitle: [row.shortName, row.stateName].filter(Boolean).join(" · ") || null,
        href: `/admin/universities/${row._id}`,
      })),
      ...students.map((row) => ({
        id: String(row._id),
        type: "Students",
        title: row.name,
        subtitle: canSeePii ? row.email : maskEmail(row.email),
        href: `/admin/students/${row._id}`,
      })),
      ...admins.map((row) => ({
        id: String(row._id),
        type: "Administrators",
        title: row.name,
        subtitle: row.roleName ?? row.email,
        href: `/admin/team`,
      })),
    ];

    return Response.json({ data: { results } });
  } catch (err) {
    console.error("[admin] global search failed:", err);
    return Response.json({ error: { message: "Search is unavailable" } }, { status: 500 });
  }
}
