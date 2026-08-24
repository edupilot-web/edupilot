import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { College, normalizeCollegeName, type CollegeDoc } from "@/models/College";
import { University } from "@/models/University";
import { Affiliation } from "@/models/Affiliation";
import { AutonomyRecord } from "@/models/AutonomyRecord";
import { City, District, State } from "@/models/Geo";
import { ImportJob, ImportRow } from "@/models/ImportJob";
import { COLLEGE_IMPORT_FIELDS, importField } from "@/lib/admin/import/schema";
import type { AutonomyStatus } from "@/lib/admin/institution-fields";

/**
 * Validation, duplicate detection and the commit (spec §10, §42).
 *
 * Written as three passes over `importRows` rather than one, because the wizard
 * shows the operator the result of each before the next runs. Nothing is
 * written to `colleges` until the operator has seen the preview and pressed
 * Import — which is the whole reason the wizard exists.
 */

type Issue = { field: string | null; value: string | null; message: string };

/**
 * Resolvers built once per validation run.
 *
 * A 1,250-row file references perhaps forty distinct universities and twenty
 * districts. Looking each up per row is 2,500 queries; loading the lookup
 * tables once is two.
 */
type Lookups = {
  universitiesByKey: Map<string, { id: mongoose.Types.ObjectId; name: string; code: string | null }>;
  statesByName: Map<string, { id: mongoose.Types.ObjectId; name: string }>;
  districtsByKey: Map<string, { id: mongoose.Types.ObjectId; name: string; stateId: mongoose.Types.ObjectId }>;
  citiesByKey: Map<string, { id: mongoose.Types.ObjectId; name: string }>;
};

async function loadLookups(): Promise<Lookups> {
  const [universities, states, districts, cities] = await Promise.all([
    University.find({ status: { $ne: "archived" } }).select("name shortName code").lean(),
    State.find({ active: true }).select("name code").lean(),
    District.find({ active: true }).select("name stateId").lean(),
    City.find({ active: true }).select("name districtId").lean(),
  ]);

  const universitiesByKey = new Map<
    string,
    { id: mongoose.Types.ObjectId; name: string; code: string | null }
  >();
  for (const university of universities) {
    const entry = {
      id: university._id,
      name: university.name,
      code: university.code ?? null,
    };
    // Indexed under every name people actually type: full name, short name and
    // code. "JNTUH" and "Jawaharlal Nehru Technological University Hyderabad"
    // appear in the same column of different spreadsheets.
    universitiesByKey.set(key(university.name), entry);
    if (university.shortName) universitiesByKey.set(key(university.shortName), entry);
    if (university.code) universitiesByKey.set(key(university.code), entry);
  }

  const statesByName = new Map(
    states.flatMap((state) => {
      const entry = { id: state._id, name: state.name };
      return [
        [key(state.name), entry] as const,
        [key(state.code), entry] as const,
      ];
    })
  );

  const districtsByKey = new Map(
    districts.map((district) => [
      `${String(district.stateId)}:${key(district.name)}`,
      { id: district._id, name: district.name, stateId: district.stateId },
    ])
  );

  const citiesByKey = new Map(
    cities.map((city) => [
      `${String(city.districtId)}:${key(city.name)}`,
      { id: city._id, name: city.name },
    ])
  );

  return { universitiesByKey, statesByName, districtsByKey, citiesByKey };
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ValidationSummary = {
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
  duplicates: number;
};

/**
 * Pass one and two: coerce every cell, then look for existing colleges.
 *
 * Runs over the rows already stored for the job, and writes each row's verdict
 * back. Nothing touches the `colleges` collection.
 */
export async function validateJob(jobId: string): Promise<ValidationSummary> {
  await connectDB();

  const job = await ImportJob.findById(jobId);
  if (!job) throw new Error("That import could not be found.");

  const mapping = (job.columnMapping ?? {}) as Record<string, string>;
  const lookups = await loadLookups();

  const rows = await ImportRow.find({ jobId: job._id }).sort({ rowNumber: 1 });

  // Names seen earlier in this same file. A spreadsheet frequently contains its
  // own duplicates, and catching them here is what stops the import creating
  // two rows that the unique index would then reject one of.
  const seenInFile = new Map<string, number>();

  const summary: ValidationSummary = { total: rows.length, valid: 0, invalid: 0, warnings: 0, duplicates: 0 };
  const writes: mongoose.AnyBulkWriteOperation[] = [];

  for (const row of rows) {
    const raw = (row.raw ?? {}) as Record<string, string>;
    const mapped: Record<string, unknown> = {};
    const errors: Issue[] = [];
    const warnings: Issue[] = [];

    // ── Coerce every mapped column ──────────────────────────────────────────
    for (const [column, fieldKey] of Object.entries(mapping)) {
      if (!fieldKey) continue;
      const field = importField(fieldKey);
      if (!field) continue;

      const result = field.coerce(raw[column] ?? "");
      if (result.error) errors.push({ field: field.label, value: raw[column] ?? "", message: result.error });
      if (result.warning) warnings.push({ field: field.label, value: raw[column] ?? "", message: result.warning });
      if (result.value !== null && result.value !== undefined) mapped[fieldKey] = result.value;
    }

    // ── Required fields ─────────────────────────────────────────────────────
    for (const field of COLLEGE_IMPORT_FIELDS) {
      if (!field.required) continue;
      if (mapped[field.key] === undefined) {
        const alreadyReported = errors.some((issue) => issue.field === field.label);
        if (!alreadyReported) {
          errors.push({ field: field.label, value: null, message: `${field.label} is required` });
        }
      }
    }

    // ── Resolve references ──────────────────────────────────────────────────
    const stateName = mapped.stateName as string | undefined;
    if (stateName) {
      const state = lookups.statesByName.get(key(stateName));
      if (!state) {
        errors.push({
          field: "State",
          value: stateName,
          message: `"${stateName}" is not a state in the system. Add it under Geography first.`,
        });
      } else {
        mapped.stateId = state.id;
        mapped.stateName = state.name;

        const districtName = mapped.districtName as string | undefined;
        if (districtName) {
          const district = lookups.districtsByKey.get(`${String(state.id)}:${key(districtName)}`);
          if (!district) {
            // A warning, not an error: the college is still importable and
            // usable without a district, and blocking the row would reject a
            // whole file over a district-boundary change.
            warnings.push({
              field: "District",
              value: districtName,
              message: `"${districtName}" is not a district of ${state.name}; the name was kept but not linked`,
            });
          } else {
            mapped.districtId = district.id;
            mapped.districtName = district.name;

            const cityName = mapped.cityName as string | undefined;
            if (cityName) {
              const city = lookups.citiesByKey.get(`${String(district.id)}:${key(cityName)}`);
              if (city) {
                mapped.cityId = city.id;
                mapped.cityName = city.name;
              }
            }
          }
        }
      }
    }

    const universityName = mapped.universityName as string | undefined;
    if (universityName) {
      const university = lookups.universitiesByKey.get(key(universityName));
      if (!university) {
        if (job.options?.createMissingUniversities) {
          warnings.push({
            field: "Affiliated university",
            value: universityName,
            message: `"${universityName}" is not in the system; it will be created`,
          });
        } else {
          errors.push({
            field: "Affiliated university",
            value: universityName,
            message: `"${universityName}" is not a university in the system`,
          });
        }
      } else {
        mapped.universityId = university.id;
        mapped.universityName = university.name;
        mapped.universityCode = university.code;
      }
    }

    // ── Duplicate detection ─────────────────────────────────────────────────
    let status: string = errors.length ? "invalid" : warnings.length ? "warning" : "valid";
    let matchedId: mongoose.Types.ObjectId | null = null;
    let matchedLabel: string | null = null;
    let matchScore: number | null = null;
    let matchReasons: string[] = [];

    const name = mapped.name as string | undefined;
    if (name && errors.length === 0) {
      const normalized = normalizeCollegeName(name);

      const earlier = seenInFile.get(normalized);
      if (earlier !== undefined) {
        errors.push({
          field: "College name",
          value: name,
          message: `The same college appears on row ${earlier} of this file`,
        });
        status = "invalid";
      } else {
        seenInFile.set(normalized, row.rowNumber);

        const match = await findExisting({
          normalizedName: normalized,
          code: mapped.code as string | undefined,
          districtName: mapped.districtName as string | undefined,
          website: mapped.website as string | undefined,
        });

        if (match) {
          status = "duplicate";
          matchedId = match.id;
          matchedLabel = match.label;
          matchScore = match.score;
          matchReasons = match.reasons;
        }
      }
    }

    if (status === "invalid") summary.invalid += 1;
    else if (status === "duplicate") summary.duplicates += 1;
    else summary.valid += 1;
    if (warnings.length) summary.warnings += 1;

    writes.push({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            mapped,
            status,
            rowErrors: errors,
            rowWarnings: warnings,
            matchedEntityId: matchedId,
            matchedEntityLabel: matchedLabel,
            matchScore,
            matchReasons,
          },
        },
      },
    });
  }

  if (writes.length) await ImportRow.bulkWrite(writes, { ordered: false });

  await ImportJob.updateOne(
    { _id: job._id },
    {
      $set: {
        stage: "validated",
        totalRows: summary.total,
        validRows: summary.valid,
        invalidRows: summary.invalid,
        warningRows: summary.warnings,
        duplicateRows: summary.duplicates,
        progress: 100,
      },
    }
  );

  return summary;
}

/**
 * Finds an existing college that a row probably describes.
 *
 * Scored rather than boolean, because the operator has to decide. An exact code
 * match is near-certain; a name match in the same district is very likely; a
 * name match in a different district might be a genuinely different college
 * with a common name — "Government Degree College" exists in every district in
 * both states.
 */
async function findExisting(input: {
  normalizedName: string;
  code?: string;
  districtName?: string;
  website?: string;
}): Promise<{ id: mongoose.Types.ObjectId; label: string; score: number; reasons: string[] } | null> {
  if (input.code) {
    const byCode = await College.findOne({ code: input.code }).select("name districtName").lean();
    if (byCode) {
      return {
        id: byCode._id,
        label: byCode.name,
        score: 100,
        reasons: [`College code ${input.code} already exists`],
      };
    }
  }

  const byName = await College.findOne({ normalizedName: input.normalizedName })
    .select("name districtName website")
    .lean();

  if (byName) {
    const reasons = ["Name is an exact match"];
    let score = 90;

    if (input.districtName && byName.districtName) {
      if (key(input.districtName) === key(byName.districtName)) {
        reasons.push("Same district");
        score = 98;
      } else {
        reasons.push(`Different district — file says ${input.districtName}, record says ${byName.districtName}`);
        score = 72;
      }
    }

    if (input.website && byName.website && key(input.website) === key(byName.website)) {
      reasons.push("Same website");
      score = Math.min(100, score + 5);
    }

    return { id: byName._id, label: byName.name, score, reasons };
  }

  if (input.website) {
    const byWebsite = await College.findOne({ website: input.website }).select("name").lean();
    if (byWebsite) {
      return {
        id: byWebsite._id,
        label: byWebsite.name,
        score: 80,
        reasons: ["A different name, but the same website"],
      };
    }
  }

  return null;
}

export type CommitResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

/**
 * Pass three: write the rows.
 *
 * Runs row by row rather than as one `bulkWrite`, because each row can produce
 * up to three documents (college, affiliation, autonomy record) and a failure
 * on one row must not abandon the rest. The per-row cost is the price of an
 * import that reports honestly on what happened to every line.
 */
export async function commitJob(
  jobId: string,
  actor: { id: string; name: string }
): Promise<CommitResult> {
  await connectDB();

  const job = await ImportJob.findById(jobId);
  if (!job) throw new Error("That import could not be found.");
  if (job.stage === "completed" || job.stage === "completed-with-warnings") {
    throw new Error("That import has already been committed.");
  }

  const startedAt = Date.now();
  await ImportJob.updateOne({ _id: job._id }, { $set: { stage: "importing", progress: 0, startedAt: new Date() } });

  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0 };

  const rows = await ImportRow.find({
    jobId: job._id,
    status: { $in: ["valid", "warning", "duplicate"] },
  }).sort({ rowNumber: 1 });

  const strategy = job.options?.duplicateStrategy ?? "skip";
  let processed = 0;

  for (const row of rows) {
    processed += 1;
    const mapped = (row.mapped ?? {}) as Record<string, unknown>;

    try {
      if (row.status === "duplicate") {
        const resolution = row.resolution ?? defaultResolution(strategy);

        if (resolution === "skip" || resolution === "keep-existing") {
          await ImportRow.updateOne({ _id: row._id }, { $set: { status: "skipped" } });
          result.skipped += 1;
          continue;
        }

        if (resolution === "update-existing" && row.matchedEntityId) {
          await College.updateOne(
            { _id: row.matchedEntityId },
            {
              $set: {
                ...writableFields(mapped),
                updatedBy: actor.id,
                sourceImportId: job._id,
              },
            }
          );
          await ImportRow.updateOne(
            { _id: row._id },
            { $set: { status: "updated", resultEntityId: row.matchedEntityId } }
          );
          result.updated += 1;
          continue;
        }
        // "create-new" falls through to the create path below.
      }

      const name = mapped.name as string;
      const created = await College.create({
        ...writableFields(mapped),
        name,
        normalizedName: normalizeCollegeName(name),
        // Imported rows are never verified on arrival. The whole point of the
        // verification queue is that a spreadsheet is a claim, not a fact.
        verificationStatus: "not-verified",
        source: "import",
        sourceImportId: job._id,
        createdBy: actor.id,
        updatedBy: actor.id,
      });

      const universityId = mapped.universityId as mongoose.Types.ObjectId | undefined;
      if (universityId) {
        const affiliation = await Affiliation.create({
          collegeId: created._id,
          universityId,
          collegeName: created.name,
          universityName: (mapped.universityName as string) ?? null,
          universityCode: (mapped.universityCode as string) ?? null,
          type: mapped.autonomyStatus === "autonomous" ? "autonomous" : "affiliated",
          status: "active",
          startDate: new Date(),
          sourceImportId: job._id,
        });
        await College.updateOne(
          { _id: created._id },
          { $set: { currentAffiliationId: affiliation._id } }
        );
        await University.updateOne({ _id: universityId }, { $inc: { collegeCount: 1 } });
      }

      const autonomy = mapped.autonomyStatus as AutonomyStatus | undefined;
      if (autonomy && autonomy !== "non-autonomous") {
        await AutonomyRecord.create({
          collegeId: created._id,
          status: autonomy,
          event: "corrected",
          note: `Recorded from the import "${job.fileName}".`,
          verificationStatus: "not-verified",
          sourceImportId: job._id,
        });
      }

      await ImportRow.updateOne(
        { _id: row._id },
        { $set: { status: "created", resultEntityId: created._id } }
      );
      result.created += 1;
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && (err as { code?: number }).code === 11000
          ? "A college with that name or code already exists"
          : "Could not be written";
      await ImportRow.updateOne(
        { _id: row._id },
        { $set: { status: "failed", failureReason: message } }
      );
      result.failed += 1;
      console.error(`[import] row ${row.rowNumber} failed:`, err);
    }

    if (processed % 25 === 0) {
      await ImportJob.updateOne(
        { _id: job._id },
        { $set: { progress: Math.round((processed / rows.length) * 100) } }
      );
    }
  }

  const invalid = await ImportRow.countDocuments({ jobId: job._id, status: "invalid" });

  await ImportJob.updateOne(
    { _id: job._id },
    {
      $set: {
        stage: result.failed > 0 || invalid > 0 ? "completed-with-warnings" : "completed",
        progress: 100,
        createdCount: result.created,
        updatedCount: result.updated,
        skippedCount: result.skipped,
        failedCount: result.failed,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    }
  );

  return result;
}

function defaultResolution(strategy: string): string {
  if (strategy === "update") return "update-existing";
  if (strategy === "create") return "create-new";
  // "ask" with no per-row answer means the operator did not decide, and the
  // safe reading of no decision is "do not touch the existing record".
  return "skip";
}

/**
 * The subset of a mapped row that may be written to a college document.
 *
 * An allow-list, not a filter of what to exclude. The mapped object is built
 * from a runtime column mapping, and a deny-list would let a renamed field
 * through the moment someone added one to the import schema.
 */
type CollegeWritePayload = Partial<
  Pick<
    CollegeDoc,
    | "code"
    | "officialName"
    | "institutionType"
    | "managementType"
    | "autonomyStatus"
    | "universityId"
    | "universityName"
    | "universityCode"
    | "stateId"
    | "stateName"
    | "districtId"
    | "districtName"
    | "cityId"
    | "cityName"
    | "address"
    | "pincode"
    | "website"
    | "email"
    | "phone"
    | "establishedYear"
    | "accreditations"
  >
>;

function writableFields(mapped: Record<string, unknown>): CollegeWritePayload {
  const allowed = [
    "code",
    "officialName",
    "institutionType",
    "managementType",
    "autonomyStatus",
    "universityId",
    "universityName",
    "universityCode",
    "stateId",
    "stateName",
    "districtId",
    "districtName",
    "cityId",
    "cityName",
    "address",
    "pincode",
    "website",
    "email",
    "phone",
    "establishedYear",
  ];

  const fields: Record<string, unknown> = {};
  for (const key of allowed) {
    if (mapped[key] !== undefined) fields[key] = mapped[key];
  }

  if (mapped.accreditationGrade) {
    fields.accreditations = [{ body: "NAAC", grade: mapped.accreditationGrade }];
  }

  // The one cast in this file. Every value was produced by a `coerce` in the
  // import schema, which is where the actual checking happens; the schema
  // validates them again on write. What is lost here is compile-time knowledge
  // of a shape that is only decided at runtime.
  return fields as CollegeWritePayload;
}
