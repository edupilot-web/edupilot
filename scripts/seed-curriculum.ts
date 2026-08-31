/**
 * Seeds regulations and curriculum subjects onto the existing academic data.
 *
 * Non-destructive and idempotent for everything it does not own: it never
 * touches colleges, departments, programmes or academic years, and it upserts
 * its own two collections by their natural keys, so re-running it converges
 * rather than duplicating.
 *
 * It seeds *onto* whatever the college seed produced. That means it must find
 * its colleges by code and its branches by department, and skip quietly when a
 * college in the list is absent — a curriculum row pointing at a college that
 * does not exist is worse than a missing curriculum.
 *
 * Run with:  npm run seed:curriculum
 *            npm run seed:curriculum -- --colleges ACET,VRSEC
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { College } from "../src/models/College";
import { Department, Program } from "../src/models/AcademicStructure";
import { CurriculumSubject, Regulation, yearForSemester } from "../src/models/Curriculum";
import {
  BRANCH_SUBJECTS,
  CURRICULUM_COLLEGE_CODES,
  R20_OVERRIDES,
  REGULATIONS,
  SHARED_SUBJECTS,
  type SeedSubject,
} from "./seed-data/curriculum";

function readArg(name: string): string | null {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : null;
}

/**
 * Which branch a department is, for looking the subject list up.
 *
 * Reads the department code first and falls back to matching the name, because
 * the college seed sets a code for the curated departments but a generated one
 * may only have a name.
 */
function branchKey(department: { code?: string | null; name: string }): string | null {
  const code = (department.code ?? "").toUpperCase();
  if (code && BRANCH_SUBJECTS[code]) return code;

  const name = department.name.toLowerCase();
  if (name.includes("computer science")) return "CSE";
  if (name.includes("information technology")) return "IT";
  if (name.includes("electronics and communication")) return "ECE";
  if (name.includes("mechanical")) return "MECH";
  return null;
}

/**
 * The subject list for one branch under one regulation.
 *
 * R20 overrides replace an R23 subject at the same semester rather than being
 * appended — the two regulations prescribe *alternatives*, and a semester
 * carrying both would be a curriculum that does not exist anywhere.
 */
function subjectsFor(branch: string, regulationCode: string): SeedSubject[] {
  const base = [...SHARED_SUBJECTS, ...(BRANCH_SUBJECTS[branch] ?? [])];
  if (regulationCode !== "R20") return base;

  const overrides = R20_OVERRIDES[branch] ?? [];
  const replacedSemesters = new Set(overrides.map((subject) => subject.semester));

  // Drop the R23 core at any semester R20 overrides, then add R20's own.
  return [
    ...base.filter(
      (subject) => !(replacedSemesters.has(subject.semester) && subject.courseType === "Core")
    ),
    ...overrides,
  ];
}

async function main(): Promise<void> {
  const only = readArg("colleges");
  const codes = only ? only.split(",").map((code) => code.trim().toUpperCase()) : CURRICULUM_COLLEGE_CODES;

  await connectDB();

  const colleges = await College.find({ code: { $in: codes } })
    .select("name code")
    .lean();

  if (!colleges.length) {
    throw new Error(
      `None of these college codes exist: ${codes.join(", ")}. Run \`npm run seed:colleges\` (or \`npm run seed:admin\`) first.`
    );
  }

  const missing = codes.filter((code) => !colleges.some((college) => college.code === code));
  if (missing.length) console.log(`skipping absent colleges: ${missing.join(", ")}`);

  let regulationCount = 0;
  let subjectCount = 0;
  let skippedBranches = 0;

  for (const college of colleges) {
    // Only degrees that actually exist at this college become "courses".
    const programs = await Program.find({ collegeId: college._id, status: "active" })
      .select("name degree specialization departmentId")
      .lean();

    const btech = programs.filter((program) => program.degree === "B.Tech");
    if (!btech.length) {
      console.log(`  ${college.code}: no B.Tech programme, skipped`);
      continue;
    }

    for (const seedRegulation of REGULATIONS) {
      /**
       * One regulation per college and degree, not per programme.
       *
       * A college runs R23 for B.Tech as a single scheme covering every branch;
       * creating it per programme would turn one real document into one per
       * branch and make "which regulation" ambiguous in the cascade.
       */
      const regulation = await Regulation.findOneAndUpdate(
        { collegeId: college._id, programId: null, code: seedRegulation.code },
        {
          $set: {
            collegeName: college.name,
            degree: "B.Tech",
            name: seedRegulation.name,
            description: seedRegulation.description,
            effectiveFromYear: seedRegulation.effectiveFromYear,
            effectiveToYear: seedRegulation.effectiveToYear,
            totalSemesters: seedRegulation.totalSemesters,
            status: seedRegulation.status,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      regulationCount += 1;

      let perRegulation = 0;

      for (const program of btech) {
        if (!program.departmentId) continue;

        const department = await Department.findById(program.departmentId).select("name code").lean();
        if (!department) continue;

        const branch = branchKey(department);
        if (!branch) {
          skippedBranches += 1;
          continue;
        }

        for (const subject of subjectsFor(branch, seedRegulation.code)) {
          const [lecture, tutorial, practical] = subject.ltp;

          await CurriculumSubject.findOneAndUpdate(
            {
              // Must match the unique key exactly. Without `branchId` the three
              // branches upsert onto one document and two of them lose the
              // subject — each one "succeeds" while overwriting the last.
              collegeId: college._id,
              regulationId: regulation._id,
              branchId: department._id,
              code: subject.code,
            },
            {
              $set: {
                programId: program._id,
                branchId: department._id,
                collegeName: college.name,
                programName: program.name,
                branchName: department.name,
                regulationCode: regulation.code,
                degree: "B.Tech",
                year: yearForSemester(subject.semester),
                semester: subject.semester,
                name: subject.name,
                credits: subject.credits,
                lectureHours: lecture,
                tutorialHours: tutorial,
                practicalHours: practical,
                courseType: subject.courseType,
                prerequisites: subject.prerequisites ?? [],
                learningObjectives: subject.learningObjectives ?? [],
                outcomes: subject.outcomes ?? [],
                syllabusText: subject.syllabusText ?? null,
                units: subject.units ?? [],
                referenceBooks: subject.referenceBooks ?? [],
                referenceMaterials: [],
                status: "active",
              },
            },
            { upsert: true, setDefaultsOnInsert: true }
          );
          subjectCount += 1;
          perRegulation += 1;
        }
      }

      await Regulation.updateOne({ _id: regulation._id }, { $set: { subjectCount: perRegulation } });
    }

    console.log(`  ${college.code}: ${college.name}`);
  }

  console.log("");
  console.log(`regulations upserted : ${regulationCount}`);
  console.log(`subjects upserted    : ${subjectCount}`);
  if (skippedBranches) {
    console.log(`branches with no curriculum data: ${skippedBranches} (only CSE, IT, ECE and MECH are seeded)`);
  }

  const totals = await CurriculumSubject.aggregate([
    { $group: { _id: { regulation: "$regulationCode", branch: "$branchName" }, n: { $sum: 1 } } },
    { $sort: { "_id.regulation": 1, "_id.branch": 1 } },
  ]);
  console.log("");
  console.log("subjects by regulation and branch:");
  for (const row of totals) {
    console.log(`  ${row._id.regulation ?? "?"}  ${String(row._id.branch ?? "?").padEnd(40)} ${row.n}`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
