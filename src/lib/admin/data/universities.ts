import mongoose, { type QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { University, type UniversityDoc } from "@/models/University";
import { College } from "@/models/College";
import { Affiliation } from "@/models/Affiliation";
import { AuditLog } from "@/models/AuditLog";
import {
  MANAGEMENT_TYPES,
  RECORD_STATUSES,
  UNIVERSITY_TYPES,
  VERIFICATION_STATUSES,
} from "@/lib/admin/institution-fields";
import {
  containsRegex,
  readEnumList,
  readList,
  readPagination,
  readParam,
  readSort,
  toMongoSort,
  type SearchParams,
} from "@/lib/admin/query";

export const UNIVERSITY_SORT_FIELDS = [
  "name",
  "collegeCount",
  "establishedYear",
  "createdAt",
  "stateName",
] as const;

export const UNIVERSITY_FILTER_KEYS = ["state", "type", "management", "verification", "status"] as const;

export function buildUniversityFilter(params: SearchParams): QueryFilter<UniversityDoc> {
  const filter: QueryFilter<UniversityDoc> = {};

  const query = readParam(params, "q")?.trim();
  if (query) {
    const term = containsRegex(query);
    filter.$or = [
      { name: term },
      { shortName: term },
      { code: term },
      { cityName: term },
      { districtName: term },
    ];
  }

  // `stateName` is free text on the document, so it takes the raw list; the
  // rest are enums and are narrowed against what the schema accepts.
  const states = readList(params, "state");
  if (states.length) filter.stateName = { $in: states };

  const types = readEnumList(params, "type", UNIVERSITY_TYPES);
  if (types.length) filter.type = { $in: types };

  const management = readEnumList(params, "management", MANAGEMENT_TYPES);
  if (management.length) filter.managementType = { $in: management };

  const verification = readEnumList(params, "verification", VERIFICATION_STATUSES);
  if (verification.length) filter.verificationStatus = { $in: verification };

  const status = readEnumList(params, "status", RECORD_STATUSES);
  filter.status = status.length ? { $in: status } : { $ne: "archived" };

  return filter;
}

export async function listUniversities(params: SearchParams) {
  await connectDB();

  const { page, limit, skip } = readPagination(params);
  const sort = readSort(params, UNIVERSITY_SORT_FIELDS, { field: "name", direction: 1 });
  const filter = buildUniversityFilter(params);

  const [docs, total] = await Promise.all([
    University.find(filter)
      .select(
        "name shortName code type managementType stateName districtName cityName establishedYear accreditations verificationStatus collegeCount status updatedAt"
      )
      .sort(toMongoSort(sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    University.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      shortName: doc.shortName ?? null,
      code: doc.code ?? null,
      type: doc.type,
      managementType: doc.managementType,
      stateName: doc.stateName ?? null,
      districtName: doc.districtName ?? null,
      cityName: doc.cityName ?? null,
      establishedYear: doc.establishedYear ?? null,
      accreditation: doc.accreditations?.[0]?.grade ?? null,
      verificationStatus: doc.verificationStatus,
      collegeCount: doc.collegeCount ?? 0,
      status: doc.status,
      updatedAt: doc.updatedAt,
    })),
  };
}

/**
 * The university record, with the colleges under it.
 *
 * The college list here is capped and sorted by student count: a university
 * page for JNTUH would otherwise try to render four hundred rows nobody scrolls
 * through, when what the reader wants is the biggest ones and a link to the
 * filtered college table for the rest.
 */
export async function getUniversityDetail(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  await connectDB();

  const university = await University.findById(id).lean();
  if (!university) return null;

  const [colleges, collegeCount, byAutonomy, byDistrict, audit, historical] = await Promise.all([
    College.find({ universityId: university._id, status: { $ne: "archived" } })
      .select("name code districtName autonomyStatus verificationStatus studentCount")
      .sort({ studentCount: -1, name: 1 })
      .limit(25)
      .lean(),
    College.countDocuments({ universityId: university._id, status: { $ne: "archived" } }),
    College.aggregate<{ _id: string; count: number }>([
      { $match: { universityId: university._id, status: { $ne: "archived" } } },
      { $group: { _id: "$autonomyStatus", count: { $sum: 1 } } },
    ]),
    College.aggregate<{ _id: string | null; count: number }>([
      { $match: { universityId: university._id, status: { $ne: "archived" } } },
      { $group: { _id: "$districtName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    AuditLog.find({ entityType: "University", entityId: university._id })
      .select("actorName action before after createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    // Colleges that were once affiliated here and have since moved.
    Affiliation.countDocuments({ universityId: university._id, status: { $ne: "active" } }),
  ]);

  return {
    id: String(university._id),
    doc: university,
    collegeCount,
    historicalAffiliations: historical,
    colleges: colleges.map((college) => ({
      id: String(college._id),
      name: college.name,
      code: college.code ?? null,
      districtName: college.districtName ?? null,
      autonomyStatus: college.autonomyStatus,
      verificationStatus: college.verificationStatus,
      studentCount: college.studentCount ?? 0,
    })),
    byAutonomy: byAutonomy.map((row) => ({ label: row._id ?? "Unknown", value: row.count })),
    byDistrict: byDistrict
      .filter((row) => row._id)
      .map((row) => ({ label: row._id as string, value: row.count })),
    audit: audit.map((row) => ({
      id: String(row._id),
      actor: row.actorName ?? "System",
      action: row.action,
      at: row.createdAt,
    })),
  };
}

export async function getUniversityFacets() {
  await connectDB();
  const rows = await University.aggregate<{ _id: string | null; count: number }>([
    { $match: { status: { $ne: "archived" } } },
    { $group: { _id: "$stateName", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  return rows
    .filter((row) => row._id)
    .map((row) => ({ value: row._id as string, label: row._id as string, count: row.count }));
}
