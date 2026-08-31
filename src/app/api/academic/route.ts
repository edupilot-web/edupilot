import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { College } from "@/models/College";
import { State } from "@/models/Geo";
import { Department, Program } from "@/models/AcademicStructure";
import { University } from "@/models/University";
import { CurriculumSubject, Regulation, ordinal, semesterWithinYear, yearForSemester } from "@/models/Curriculum";
import { containsRegex } from "@/lib/admin/query";

/**
 * The academic reference data the onboarding flow reads (spec §28, §29).
 *
 * One route with a `step` parameter. The steps share their auth, their envelope
 * and their "everything before me must be supplied" contract; seven routes would
 * be seven copies of that with seven chances to diverge.
 *
 * **Requires a signed-in student.** This is reference data rather than anyone's
 * personal information, but it is also a complete map of the platform's
 * institutional coverage, and there is no reason for it to be public.
 *
 * Every step returns *only* what the supplied prefix allows. A subject query
 * missing `branchId` returns nothing rather than another branch's subjects —
 * silently widening is how one student's curriculum ends up on another's profile.
 *
 *   GET /api/academic?step=states
 *   GET /api/academic?step=colleges&stateId=…&search=…
 *   GET /api/academic?step=college&collegeId=…
 *   GET /api/academic?step=courses&collegeId=…
 *   GET /api/academic?step=branches&collegeId=…&programId=…
 *   GET /api/academic?step=regulations&collegeId=…&programId=…
 *   GET /api/academic?step=semesters&regulationId=…&branchId=…
 *   GET /api/academic?step=subjects&…&semester=3
 */

/** Search results are capped: onboarding wants ten good answers, not five hundred. */
const SEARCH_LIMIT = 30;
const MIN_SEARCH = 2;

function objectId(value: string | null): Types.ObjectId | null {
  if (!value || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

export async function GET(req: NextRequest) {
  try {
    // A student session, not an admin one.
    await requireAuth();
    await connectDB();

    const params = req.nextUrl.searchParams;
    const step = params.get("step") ?? "";

    const stateId = objectId(params.get("stateId"));
    const collegeId = objectId(params.get("collegeId"));
    const programId = objectId(params.get("programId"));
    const branchId = objectId(params.get("branchId"));
    const regulationId = objectId(params.get("regulationId"));
    const search = (params.get("search") ?? "").trim();

    switch (step) {
      /**
       * States that actually have institutions (spec §9).
       *
       * Offering all 36 would let a student pick Kerala and find an empty college
       * list, which reads as a broken product rather than "not launched here
       * yet". States with no colleges are returned separately as `comingSoon`.
       */
      case "states": {
        const states = await State.find({}).select("name code").sort({ name: 1 }).lean();
        const counts = await College.aggregate<{ _id: Types.ObjectId | null; n: number }>([
          { $match: { status: "active" } },
          { $group: { _id: "$stateId", n: { $sum: 1 } } },
        ]);
        const byState = new Map(counts.map((row) => [String(row._id), row.n]));

        const available: { value: string; label: string; count: number }[] = [];
        const comingSoon: string[] = [];

        for (const state of states) {
          const count = byState.get(String(state._id)) ?? 0;
          if (count > 0) {
            available.push({ value: String(state._id), label: state.name, count });
          } else {
            comingSoon.push(state.name);
          }
        }

        available.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        return ok({ states: available, comingSoon });
      }

      /**
       * Colleges and universities in one list (spec §10, §11).
       *
       * Both are offered together because a student does not think of themselves
       * as choosing "a college or a university" — they type where they study.
       * University departments come back as colleges whose `institutionType`
       * says so, which is Path B of §11 without a separate screen.
       */
      case "colleges": {
        if (!stateId) return ok({ institutions: [], popular: [] });

        const filter: Record<string, unknown> = { stateId, status: "active" };
        if (search.length >= MIN_SEARCH) {
          const term = containsRegex(search);
          filter.$or = [{ name: term }, { code: term }, { cityName: term }, { districtName: term }];
        }

        const [colleges, universities] = await Promise.all([
          College.find(filter)
            .select("name code institutionType autonomyStatus universityId districtName cityName studentCount")
            .sort(search.length >= MIN_SEARCH ? { name: 1 } : { studentCount: -1, name: 1 })
            .limit(SEARCH_LIMIT)
            .lean(),
          // Universities are only offered when searching: an unfiltered list
          // would push the 44 universities above the colleges most students want.
          search.length >= MIN_SEARCH
            ? University.find({
                stateId,
                status: { $ne: "archived" },
                $or: [{ name: containsRegex(search) }, { shortName: containsRegex(search) }, { code: containsRegex(search) }],
              })
                .select("name shortName code districtName cityName")
                .limit(10)
                .lean()
            : Promise.resolve([]),
        ]);

        const universityIds = colleges.map((college) => college.universityId).filter(Boolean);
        const affiliations = await University.find({ _id: { $in: universityIds } })
          .select("shortName name")
          .lean();
        const byId = new Map(affiliations.map((entry) => [String(entry._id), entry]));

        const institutions = colleges.map((college) => {
          const university = college.universityId ? byId.get(String(college.universityId)) : null;
          return {
            kind: "college" as const,
            value: String(college._id),
            label: college.name,
            code: college.code ?? null,
            institutionType: college.institutionType ?? "Affiliated College",
            autonomyStatus: college.autonomyStatus ?? "non-autonomous",
            affiliation: university ? (university.shortName || university.name) : null,
            location: [college.cityName, college.districtName].filter(Boolean).join(", ") || null,
          };
        });

        return ok({
          institutions,
          /** Matching universities, for the student who studies at one directly. */
          universities: universities.map((university) => ({
            kind: "university" as const,
            value: String(university._id),
            label: university.name,
            code: university.shortName || university.code || null,
            location: [university.cityName, university.districtName].filter(Boolean).join(", ") || null,
          })),
        });
      }

      /** The confirmation card of §12. */
      case "college": {
        if (!collegeId) return fail("A collegeId is required", 400);

        const college = await College.findById(collegeId)
          .select("name code institutionType autonomyStatus universityId stateName districtName cityName status")
          .lean();
        if (!college) return fail("That college no longer exists", 404);

        const university = college.universityId
          ? await University.findById(college.universityId).select("name shortName type").lean()
          : null;

        return ok({
          college: {
            id: String(college._id),
            name: college.name,
            code: college.code ?? null,
            institutionType: college.institutionType ?? "Affiliated College",
            autonomyStatus: college.autonomyStatus ?? "non-autonomous",
            location: [college.cityName, college.districtName, college.stateName]
              .filter(Boolean)
              .join(", "),
            active: college.status === "active",
            university: university
              ? {
                  id: String(university._id),
                  name: university.name,
                  shortName: university.shortName ?? null,
                  type: university.type,
                }
              : null,
          },
        });
      }

      /**
       * Courses at this college, as distinct degrees.
       *
       * Grouped rather than listed per programme: a college with CSE, ECE and IT
       * has three B.Tech programmes, and offering "B.Tech" three times would be
       * asking the student to pick their branch before they have been asked for
       * it.
       */
      case "courses": {
        if (!collegeId) return ok({ courses: [] });

        const rows = await Program.aggregate<{
          _id: string;
          count: number;
          durationYears: number | null;
          programIds: Types.ObjectId[];
        }>([
          { $match: { collegeId, status: "active" } },
          {
            $group: {
              _id: "$degree",
              count: { $sum: 1 },
              durationYears: { $first: "$durationYears" },
              programIds: { $push: "$_id" },
            },
          },
          { $sort: { count: -1, _id: 1 } },
        ]);

        return ok({
          courses: rows
            .filter((row) => row._id)
            .map((row) => ({
              value: row._id,
              label: row._id,
              durationYears: row.durationYears ?? null,
              branchCount: row.count,
            })),
        });
      }

      /**
       * Branches offering this degree, each carrying its programme id.
       *
       * The (college, degree, branch) triple identifies exactly one programme, so
       * resolving it here saves every later call from re-deriving it — and means
       * the client never has to know that "course" is a degree string.
       */
      case "branches": {
        const degree = params.get("degree") ?? "";
        if (!collegeId || !degree) return ok({ branches: [] });

        const programs = await Program.find({ collegeId, degree, status: "active" })
          .select("name departmentId durationYears")
          .lean();

        const departmentIds = programs.map((program) => program.departmentId).filter(Boolean);
        const departments = await Department.find({ _id: { $in: departmentIds } })
          .select("name code")
          .lean();
        const byId = new Map(departments.map((department) => [String(department._id), department]));

        const branches = programs
          .map((program) => {
            const department = program.departmentId ? byId.get(String(program.departmentId)) : null;
            if (!department) return null;
            return {
              value: String(department._id),
              label: department.name,
              code: department.code ?? null,
              programId: String(program._id),
              programName: program.name,
              durationYears: program.durationYears ?? null,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .sort((a, b) => a.label.localeCompare(b.label));

        return ok({ branches });
      }

      /**
       * Regulations for this college and degree (spec §14).
       *
       * Superseded ones are included: a 2022-batch student is still on R20 after
       * R23 arrives, and hiding it would leave the seniors unable to onboard.
       */
      case "regulations": {
        if (!collegeId) return ok({ regulations: [] });
        const degree = params.get("degree") ?? "";

        const rows = await Regulation.find({
          collegeId,
          status: { $ne: "archived" },
          $and: [
            { $or: [{ programId: null }, ...(programId ? [{ programId }] : [])] },
            { $or: [{ degree: null }, ...(degree ? [{ degree }] : [])] },
          ],
        })
          .select("code name effectiveFromYear effectiveToYear totalSemesters status")
          .sort({ effectiveFromYear: -1 })
          .lean();

        return ok({
          regulations: rows.map((row) => ({
            value: String(row._id),
            label: row.code,
            name: row.name,
            effectiveFromYear: row.effectiveFromYear,
            effectiveToYear: row.effectiveToYear ?? null,
            totalSemesters: row.totalSemesters ?? 8,
            superseded: row.status === "superseded",
          })),
        });
      }

      /**
       * Year/semester pairs the regulation defines (spec §20, §21).
       *
       * Derived from `totalSemesters` and filtered to semesters that actually
       * have subjects, so a student is never sent to a step with nothing in it.
       */
      case "semesters": {
        if (!regulationId) return ok({ semesters: [] });

        const regulation = await Regulation.findById(regulationId).select("totalSemesters").lean();
        if (!regulation) return ok({ semesters: [] });

        const match: Record<string, unknown> = { regulationId, status: "active" };
        if (branchId) match.branchId = branchId;

        const populated = await CurriculumSubject.aggregate<{ _id: number; n: number }>([
          { $match: match },
          { $group: { _id: "$semester", n: { $sum: 1 } } },
        ]);
        const counts = new Map(populated.map((row) => [row._id, row.n]));

        const semesters: {
          value: number;
          label: string;
          year: number;
          subjectCount: number;
        }[] = [];

        for (let semester = 1; semester <= (regulation.totalSemesters ?? 8); semester += 1) {
          const count = counts.get(semester);
          if (!count) continue;
          const year = yearForSemester(semester);
          semesters.push({
            value: semester,
            label: `${ordinal(year)} Year · ${ordinal(semesterWithinYear(semester))} Semester`,
            year,
            subjectCount: count,
          });
        }

        return ok({ semesters });
      }

      /** Subjects for the exact coordinate (spec §22, §24, §29). */
      case "subjects": {
        const semester = Number(params.get("semester") ?? "");
        if (!collegeId || !programId || !branchId || !regulationId || !Number.isInteger(semester)) {
          return ok({ subjects: [] });
        }

        const filter: Record<string, unknown> = {
          collegeId,
          programId,
          branchId,
          regulationId,
          semester,
          status: "active",
        };
        if (search.length >= MIN_SEARCH) {
          const term = containsRegex(search);
          filter.$or = [{ name: term }, { code: term }];
        }

        const rows = await CurriculumSubject.find(filter)
          .select("name code credits courseType units")
          .sort({ courseType: 1, name: 1 })
          .lean();

        return ok({
          subjects: rows.map((row) => ({
            value: String(row._id),
            label: row.name,
            code: row.code,
            credits: row.credits ?? null,
            type: row.courseType ?? "Core",
            /**
             * Core, lab, mandatory and project subjects are not a choice — a
             * student cannot opt out of Operating Systems. Electives are (§25),
             * so only those are unticked by default.
             */
            required: !["Elective", "Open Elective", "Professional Elective"].includes(
              row.courseType ?? "Core"
            ),
            unitCount: row.units?.length ?? 0,
          })),
        });
      }

      default:
        return fail(`Unknown step "${step}"`, 400);
    }
  } catch (err) {
    return handleError(err);
  }
}
