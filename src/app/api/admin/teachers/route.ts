import { ok, withPermission } from "@/lib/admin/ai/api";
import { listTeachers } from "@/lib/admin/data/teachers";

/**
 * GET /api/admin/teachers  (§56)
 *
 * Every teacher this administrator may see — their college's, or the whole
 * platform's for an unscoped admin. The scope comes from the administrator's
 * own record and there is no parameter that widens it.
 */
export async function GET(req: Request) {
  return withPermission("teacher.view", async (admin) => {
    const params = new URL(req.url).searchParams;

    const result = await listTeachers(admin, {
      status: params.get("status"),
      search: params.get("q"),
      limit: Number(params.get("limit")) || 25,
      skip: Number(params.get("skip")) || 0,
    });

    return ok(result);
  });
}
