import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Department, Program } from "@/models/AcademicStructure";
import { Affiliation } from "@/models/Affiliation";
import {
  containsRegex,
  readList,
  readPagination,
  readParam,
  type SearchParams,
} from "@/lib/admin/query";

/**
 * Departments, programs and affiliation records as flat lists.
 *
 * Each is also reachable from its college's detail page; these screens exist
 * for the cross-college question — "which colleges teach Data Science?", "which
 * colleges moved between universities last year?" — that a per-college view
 * cannot answer.
 */

export async function listDepartments(params: SearchParams) {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  const filter: Record<string, unknown> = {};

  const query = readParam(params, "q")?.trim();
  if (query) {
    const term = containsRegex(query);
    filter.$or = [{ name: term }, { code: term }, { collegeName: term }, { headOfDepartment: term }];
  }

  const college = readParam(params, "college");
  if (college && mongoose.Types.ObjectId.isValid(college)) {
    filter.collegeId = new mongoose.Types.ObjectId(college);
  }

  const status = readList(params, "status");
  if (status.length) filter.status = { $in: status };

  const [docs, total] = await Promise.all([
    Department.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Department.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      code: doc.code ?? null,
      canonicalKey: doc.canonicalKey ?? null,
      collegeId: String(doc.collegeId),
      collegeName: doc.collegeName ?? "—",
      hod: doc.headOfDepartment ?? null,
      status: doc.status,
      programCount: doc.programCount ?? 0,
      studentCount: doc.studentCount ?? 0,
    })),
  };
}

/**
 * Department names grouped by their canonical key.
 *
 * The answer to "how many ways do our colleges spell Computer Science?" — the
 * long tail that the Data Quality screen would otherwise have to guess at.
 */
export async function getDepartmentVariants(limit = 12) {
  await connectDB();

  const rows = await Department.aggregate<{ _id: string | null; names: string[]; count: number }>([
    { $match: { canonicalKey: { $ne: null } } },
    { $group: { _id: "$canonicalKey", names: { $addToSet: "$name" }, count: { $sum: 1 } } },
    { $match: { "names.1": { $exists: true } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  return rows.map((row) => ({
    key: row._id ?? "",
    names: row.names,
    count: row.count,
  }));
}

export async function listPrograms(params: SearchParams) {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  const filter: Record<string, unknown> = {};

  const query = readParam(params, "q")?.trim();
  if (query) {
    const term = containsRegex(query);
    filter.$or = [
      { name: term },
      { code: term },
      { degree: term },
      { specialization: term },
      { collegeName: term },
    ];
  }

  const college = readParam(params, "college");
  if (college && mongoose.Types.ObjectId.isValid(college)) {
    filter.collegeId = new mongoose.Types.ObjectId(college);
  }

  const degrees = readList(params, "degree");
  if (degrees.length) filter.degree = { $in: degrees };
  const levels = readList(params, "level");
  if (levels.length) filter.level = { $in: levels };

  const [docs, total] = await Promise.all([
    Program.find(filter).sort({ degree: 1, name: 1 }).skip(skip).limit(limit).lean(),
    Program.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      code: doc.code ?? null,
      degree: doc.degree,
      specialization: doc.specialization ?? null,
      level: doc.level,
      mode: doc.mode,
      durationYears: doc.durationYears,
      intake: doc.intake ?? null,
      status: doc.status,
      collegeId: String(doc.collegeId),
      collegeName: doc.collegeName ?? "—",
      departmentName: doc.departmentName ?? null,
      studentCount: doc.studentCount ?? 0,
    })),
  };
}

export async function listAffiliations(params: SearchParams) {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  const filter: Record<string, unknown> = {};

  const query = readParam(params, "q")?.trim();
  if (query) {
    const term = containsRegex(query);
    filter.$or = [{ collegeName: term }, { universityName: term }, { referenceNumber: term }];
  }

  const college = readParam(params, "college");
  if (college && mongoose.Types.ObjectId.isValid(college)) {
    filter.collegeId = new mongoose.Types.ObjectId(college);
  }

  const university = readParam(params, "university");
  if (university && mongoose.Types.ObjectId.isValid(university)) {
    filter.universityId = new mongoose.Types.ObjectId(university);
  }

  const status = readList(params, "status");
  if (status.length) filter.status = { $in: status };
  const types = readList(params, "type");
  if (types.length) filter.type = { $in: types };

  const [docs, total] = await Promise.all([
    Affiliation.find(filter).sort({ startDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Affiliation.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      collegeId: String(doc.collegeId),
      collegeName: doc.collegeName ?? "—",
      universityId: String(doc.universityId),
      universityName: doc.universityName ?? "—",
      universityCode: doc.universityCode ?? null,
      type: doc.type,
      status: doc.status,
      startDate: doc.startDate ?? null,
      endDate: doc.endDate ?? null,
      referenceNumber: doc.referenceNumber ?? null,
      verificationStatus: doc.verificationStatus,
      note: doc.note ?? null,
    })),
  };
}
