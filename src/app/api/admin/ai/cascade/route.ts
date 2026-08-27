import type { NextRequest } from "next/server";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import {
  getSubjectDetail,
  listAcademicYears,
  listBranches,
  listCascadeColleges,
  listCourses,
  listRegulations,
  listSemesters,
  listSubjects,
} from "@/lib/admin/data/curriculum";

/**
 * The academic cascade endpoint (spec §4).
 *
 * One route with a `step` parameter rather than seven routes. The steps share
 * their auth, their envelope and their "everything before me must be supplied"
 * contract, and splitting them would mean seven copies of that with seven
 * chances to differ.
 *
 * Each step reads only the ids of the steps before it. A step called without its
 * prerequisites returns an empty list, never a broader one — a subject query
 * missing `branchId` would otherwise answer with another branch's subjects,
 * which is exactly the leak §44 prohibits.
 *
 *   GET /api/admin/ai/cascade?step=colleges&q=aditya
 *   GET /api/admin/ai/cascade?step=courses&collegeId=…
 *   GET /api/admin/ai/cascade?step=branches&collegeId=…&degree=B.Tech
 *   GET /api/admin/ai/cascade?step=regulations&collegeId=…&degree=…&programId=…
 *   GET /api/admin/ai/cascade?step=academic-years&regulationId=…
 *   GET /api/admin/ai/cascade?step=semesters&regulationId=…&branchId=…
 *   GET /api/admin/ai/cascade?step=subjects&…&semester=3
 *   GET /api/admin/ai/cascade?step=subject&subjectId=…
 */
export async function GET(req: NextRequest) {
  return withPermission("ai_course_content.view", async () => {
    const params = req.nextUrl.searchParams;
    const step = params.get("step") ?? "";

    const collegeId = params.get("collegeId") ?? "";
    const degree = params.get("degree") ?? "";
    const programId = params.get("programId") ?? "";
    const branchId = params.get("branchId") ?? "";
    const regulationId = params.get("regulationId") ?? "";
    const semester = Number(params.get("semester") ?? "");

    switch (step) {
      case "colleges":
        return ok({ options: await listCascadeColleges(params.get("q") ?? undefined) });

      case "courses":
        if (!collegeId) return ok({ options: [] });
        return ok({ options: await listCourses(collegeId) });

      case "branches":
        if (!collegeId || !degree) return ok({ options: [] });
        return ok({ options: await listBranches(collegeId, degree) });

      case "regulations":
        if (!collegeId || !degree) return ok({ options: [] });
        return ok({ options: await listRegulations(collegeId, degree, programId || undefined) });

      case "academic-years":
        // Callable with no regulation: the list is then unconstrained, which is
        // correct for a screen that has not reached step 4 yet.
        return ok({ options: await listAcademicYears(regulationId || undefined) });

      case "semesters":
        if (!regulationId) return ok({ options: [] });
        return ok({ options: await listSemesters(regulationId, branchId || undefined) });

      case "subjects":
        if (!collegeId || !programId || !branchId || !regulationId || !Number.isInteger(semester)) {
          return ok({ options: [] });
        }
        return ok({
          options: await listSubjects({ collegeId, programId, branchId, regulationId, semester }),
        });

      case "subject": {
        const subjectId = params.get("subjectId") ?? "";
        if (!subjectId) return fail("A subjectId is required.", 400, { code: "missing-subject" });

        const subject = await getSubjectDetail(subjectId);
        if (!subject) return fail("That subject no longer exists.", 404, { code: "subject-not-found" });
        return ok({ subject });
      }

      default:
        return fail(
          `Unknown cascade step "${step}".`,
          400,
          { code: "unknown-step" }
        );
    }
  });
}
