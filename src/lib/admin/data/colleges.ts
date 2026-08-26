import mongoose, { type QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { College, type CollegeDoc } from "@/models/College";
import { University } from "@/models/University";
import { Affiliation } from "@/models/Affiliation";
import { AutonomyRecord } from "@/models/AutonomyRecord";
import { Department, Program } from "@/models/AcademicStructure";
import { StudentProfile } from "@/models/StudentProfile";
import { AuditLog } from "@/models/AuditLog";
import { District, State } from "@/models/Geo";
import {
  RECORD_STATUSES,
  VERIFICATION_STATUSES,
  type VerificationStatus,
} from "@/lib/admin/institution-fields";
import {
  containsRegex,
  readEnumList,
  readDateRange,
  readList,
  readPagination,
  readParam,
  readSort,
  toMongoSort,
  type SearchParams,
} from "@/lib/admin/query";

/** Columns the list may be sorted by. Each one is covered by an index. */
export const COLLEGE_SORT_FIELDS = [
  "name",
  "createdAt",
  "updatedAt",
  "studentCount",
  "verificationStatus",
  "stateName",
] as const;

/** Everything "Clear filters" should drop, and what the export reproduces. */
export const COLLEGE_FILTER_KEYS = [
  "state",
  "district",
  "type",
  "management",
  "autonomy",
  "university",
  "verification",
  "status",
  "accreditation",
  "source",
  "created",
  "updated",
] as const;

export type CollegeRow = {
  id: string;
  name: string;
  code: string | null;
  institutionType: string;
  managementType: string;
  autonomyStatus: string;
  universityName: string | null;
  universityId: string | null;
  districtName: string | null;
  stateName: string | null;
  cityName: string | null;
  accreditation: string | null;
  verificationStatus: string;
  studentCount: number;
  status: string;
  updatedAt: Date;
  source: string;
};

/**
 * Builds the Mongo filter from the URL.
 *
 * Exported separately from `listColleges` because the export job has to
 * reproduce *exactly* the rows the operator was looking at when they pressed
 * Export. Two implementations of "what does this querystring mean" would
 * eventually disagree, and the disagreement would show up as a CSV that does
 * not match the screen.
 */
export function buildCollegeFilter(params: SearchParams): QueryFilter<CollegeDoc> {
  const filter: QueryFilter<CollegeDoc> = {};

  const query = readParam(params, "q")?.trim();
  if (query) {
    // Regex rather than `$text`, deliberately. `$text` matches whole words, so
    // "andhr" finds nothing and "JNTU" misses "JNTUH" — and an operator typing
    // into a search box expects to see results before they finish the word.
    // The text index is still there for the global palette, which searches
    // across collections and can afford whole-word semantics.
    const term = containsRegex(query);
    filter.$or = [
      { name: term },
      { officialName: term },
      { shortName: term },
      { code: term },
      { universityName: term },
      { cityName: term },
      { districtName: term },
      { pincode: term },
    ];
  }

  applyIn(filter, "stateName", readList(params, "state"));
  applyIn(filter, "districtName", readList(params, "district"));
  applyIn(filter, "institutionType", readList(params, "type"));
  applyIn(filter, "managementType", readList(params, "management"));
  applyIn(filter, "autonomyStatus", readList(params, "autonomy"));
  applyIn(filter, "verificationStatus", readList(params, "verification"));
  applyIn(filter, "source", readList(params, "source"));

  const universities = readList(params, "university").filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (universities.length) {
    filter.universityId = { $in: universities.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const accreditation = readList(params, "accreditation");
  if (accreditation.length) filter["accreditations.grade"] = { $in: accreditation };

  const status = readEnumList(params, "status", RECORD_STATUSES);
  // Archived rows are noise in the default view; an explicit filter opts in.
  filter.status = status.length ? { $in: status } : { $ne: "archived" };

  const created = readDateRange(params, "created");
  if (created) filter.createdAt = created;
  const updated = readDateRange(params, "updated");
  if (updated) filter.updatedAt = updated;

  return filter;
}

function applyIn(filter: Record<string, unknown>, field: string, values: string[]): void {
  if (values.length) filter[field] = { $in: values };
}

export async function listColleges(params: SearchParams): Promise<{
  rows: CollegeRow[];
  total: number;
  page: number;
  limit: number;
}> {
  await connectDB();

  const { page, limit, skip } = readPagination(params);
  const sort = readSort(params, COLLEGE_SORT_FIELDS, { field: "name", direction: 1 });
  const filter = buildCollegeFilter(params);

  const [docs, total] = await Promise.all([
    College.find(filter)
      .select(
        "name code institutionType managementType autonomyStatus universityName universityId districtName stateName cityName accreditations verificationStatus studentCount status updatedAt source"
      )
      .sort(toMongoSort(sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    // `countDocuments` on a filtered query is the honest number and is what the
    // pager needs. If this becomes the slow part, the fix is a capped estimate
    // with "10,000+" in the footer, not a silently wrong count.
    College.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      code: doc.code ?? null,
      institutionType: doc.institutionType,
      managementType: doc.managementType,
      autonomyStatus: doc.autonomyStatus,
      universityName: doc.universityName ?? null,
      universityId: doc.universityId ? String(doc.universityId) : null,
      districtName: doc.districtName ?? null,
      stateName: doc.stateName ?? null,
      cityName: doc.cityName ?? null,
      accreditation: doc.accreditations?.[0]?.grade ?? null,
      verificationStatus: doc.verificationStatus,
      studentCount: doc.studentCount ?? 0,
      status: doc.status,
      updatedAt: doc.updatedAt,
      source: doc.source,
    })),
  };
}

/**
 * Options for the filter chips, with counts.
 *
 * Counts are unfiltered totals rather than counts within the current filter.
 * Faceted counts would need one aggregation per facet on every page load, and
 * the number an operator actually wants from a chip is "how many are there
 * altogether" — the filtered figure is already in the footer.
 */
export async function getCollegeFacets(params: SearchParams): Promise<{
  states: { value: string; label: string; count: number }[];
  districts: { value: string; label: string; count: number }[];
  universities: { value: string; label: string }[];
}> {
  await connectDB();

  const selectedStates = readList(params, "state");

  const [stateRows, universityRows, districtRows] = await Promise.all([
    College.aggregate<{ _id: string | null; count: number }>([
      { $match: { status: { $ne: "archived" } } },
      { $group: { _id: "$stateName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    University.find({ status: "active" })
      .select("name shortName code")
      .sort({ collegeCount: -1 })
      .limit(24)
      .lean(),
    // Districts are only offered once a state is chosen: 750-odd districts is
    // not a chip row, and the list is meaningless without its state anyway.
    selectedStates.length
      ? College.aggregate<{ _id: string | null; count: number }>([
          { $match: { status: { $ne: "archived" }, stateName: { $in: selectedStates } } },
          { $group: { _id: "$districtName", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $limit: 40 },
        ])
      : Promise.resolve([]),
  ]);

  return {
    states: stateRows
      .filter((row) => row._id)
      .map((row) => ({ value: row._id as string, label: row._id as string, count: row.count })),
    districts: districtRows
      .filter((row) => row._id)
      .map((row) => ({ value: row._id as string, label: row._id as string, count: row.count })),
    universities: universityRows.map((row) => ({
      value: String(row._id),
      label: row.shortName || row.code || row.name,
    })),
  };
}

/**
 * Verification census for the summary tiles.
 *
 * Directory-wide rather than filtered, for the same reason the facet counts
 * above are: the tiles are a census of the whole directory and the way into each
 * status, so a figure that moved with the current filter would mean something
 * different on every visit. The filtered count is already in the table footer.
 *
 * Every status in `VERIFICATION_STATUSES` appears in the result, zero included.
 * A status that disappeared when empty would stop the tiles summing to the
 * total, and "none rejected" is itself worth saying.
 *
 * Archived rows are excluded, matching `listColleges` and the facets — a tile
 * total that counted them would not agree with the table underneath it.
 */
export async function getCollegeVerificationTotals(): Promise<{
  total: number;
  byStatus: Record<VerificationStatus, number>;
}> {
  await connectDB();

  const rows = await College.aggregate<{ _id: string | null; count: number }>([
    { $match: { status: { $ne: "archived" } } },
    { $group: { _id: "$verificationStatus", count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(
    VERIFICATION_STATUSES.map((status) => [status, 0])
  ) as Record<VerificationStatus, number>;

  let total = 0;
  for (const row of rows) {
    total += row.count;
    if (row._id && row._id in byStatus) byStatus[row._id as VerificationStatus] = row.count;
  }

  return { total, byStatus };
}

// ── Detail ─────────────────────────────────────────────────────────────────

export type CollegeDetail = NonNullable<Awaited<ReturnType<typeof getCollegeDetail>>>;

/**
 * Everything the college detail page shows.
 *
 * One function returning the whole page's data rather than the page calling six
 * loaders: it makes the parallelism explicit, and it is the seam where a future
 * read replica or cache goes.
 */
export async function getCollegeDetail(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  await connectDB();

  const college = await College.findById(id).lean();
  if (!college) return null;

  const [affiliations, autonomy, departments, programs, studentCount, recentAudit] =
    await Promise.all([
      Affiliation.find({ collegeId: college._id })
        .select("universityId universityName universityCode type status startDate endDate referenceNumber documentUrl verificationStatus note")
        .sort({ startDate: -1, createdAt: -1 })
        .lean(),
      AutonomyRecord.find({ collegeId: college._id })
        .select("status event validFrom validUntil approvalAuthority approvalReference approvalDate documentUrl verificationStatus note createdAt")
        .sort({ validFrom: -1, createdAt: -1 })
        .lean(),
      Department.find({ collegeId: college._id })
        .select("name code headOfDepartment status programCount studentCount")
        .sort({ name: 1 })
        .limit(60)
        .lean(),
      Program.find({ collegeId: college._id })
        .select("name degree specialization level durationYears intake status departmentName")
        .sort({ degree: 1, name: 1 })
        .limit(60)
        .lean(),
      // Read live rather than trusting the denormalised counter, because this
      // is the one screen where the exact number is being looked at.
      StudentProfile.countDocuments({ collegeId: college._id }),
      AuditLog.find({ entityType: "College", entityId: college._id })
        .select("actorName action before after createdAt severity")
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
    ]);

  return {
    id: String(college._id),
    doc: college,
    affiliations: affiliations.map((row) => ({
      id: String(row._id),
      universityId: String(row.universityId),
      universityName: row.universityName,
      universityCode: row.universityCode,
      type: row.type,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      referenceNumber: row.referenceNumber,
      documentUrl: row.documentUrl,
      verificationStatus: row.verificationStatus,
      note: row.note,
    })),
    autonomy: autonomy.map((row) => ({
      id: String(row._id),
      status: row.status,
      event: row.event,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      approvalAuthority: row.approvalAuthority,
      approvalReference: row.approvalReference,
      approvalDate: row.approvalDate,
      documentUrl: row.documentUrl,
      verificationStatus: row.verificationStatus,
      note: row.note,
      createdAt: row.createdAt,
    })),
    departments: departments.map((row) => ({
      id: String(row._id),
      name: row.name,
      code: row.code,
      hod: row.headOfDepartment,
      status: row.status,
      programCount: row.programCount ?? 0,
      studentCount: row.studentCount ?? 0,
    })),
    programs: programs.map((row) => ({
      id: String(row._id),
      name: row.name,
      degree: row.degree,
      specialization: row.specialization,
      level: row.level,
      durationYears: row.durationYears,
      intake: row.intake,
      status: row.status,
      departmentName: row.departmentName,
    })),
    studentCount,
    audit: recentAudit.map((row) => ({
      id: String(row._id),
      actor: row.actorName ?? "System",
      action: row.action,
      before: row.before as Record<string, unknown> | null,
      after: row.after as Record<string, unknown> | null,
      at: row.createdAt,
      severity: row.severity ?? "info",
    })),
  };
}

/** Options for the add/edit form's location and university pickers. */
export async function getCollegeFormOptions(stateId?: string | null) {
  await connectDB();

  const [states, districts, universities] = await Promise.all([
    State.find({ active: true }).select("name code").sort({ displayOrder: 1, name: 1 }).lean(),
    stateId && mongoose.Types.ObjectId.isValid(stateId)
      ? District.find({ stateId, active: true }).select("name").sort({ name: 1 }).lean()
      : Promise.resolve([]),
    University.find({ status: "active" })
      .select("name shortName code stateName")
      .sort({ name: 1 })
      .lean(),
  ]);

  return {
    states: states.map((row) => ({ id: String(row._id), name: row.name, code: row.code })),
    districts: districts.map((row) => ({ id: String(row._id), name: row.name })),
    universities: universities.map((row) => ({
      id: String(row._id),
      name: row.name,
      shortName: row.shortName ?? row.code ?? null,
      stateName: row.stateName ?? null,
    })),
  };
}

/**
 * Every district, grouped by state id.
 *
 * Shipped whole to the college form rather than fetched when the state changes:
 * roughly sixty rows across the launch states is less data than the JSON of one
 * round trip, and the picker keeps working with no network.
 */
export async function getDistrictsByState(): Promise<Record<string, { id: string; name: string }[]>> {
  await connectDB();
  const rows = await District.find({ active: true }).select("name stateId").sort({ name: 1 }).lean();

  const grouped: Record<string, { id: string; name: string }[]> = {};
  for (const row of rows) {
    const key = String(row.stateId);
    (grouped[key] ??= []).push({ id: String(row._id), name: row.name });
  }
  return grouped;
}
