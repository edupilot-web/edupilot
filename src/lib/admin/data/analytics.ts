import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { University } from "@/models/University";
import { StudentProfile } from "@/models/StudentProfile";
import { User } from "@/models/User";
import { readParam, type SearchParams } from "@/lib/admin/query";

/**
 * Analytics queries (spec §24–§25).
 *
 * Every one is an aggregation against an index. At the scale this is designed
 * for, these become reads from a nightly rollup collection — the return shapes
 * are what the pages consume, so that swap happens here and nowhere else.
 */

export const RANGES = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "3m", label: "3 months", days: 90 },
  { value: "6m", label: "6 months", days: 180 },
  { value: "12m", label: "12 months", days: 365 },
] as const;

export type RangeValue = (typeof RANGES)[number]["value"];

export function readRange(params: SearchParams): (typeof RANGES)[number] {
  const raw = readParam(params, "range");
  return RANGES.find((entry) => entry.value === raw) ?? RANGES[1];
}

function since(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ── Students ───────────────────────────────────────────────────────────────

export async function getStudentAnalytics(days: number) {
  await connectDB();
  const from = since(days);
  const previousFrom = since(days * 2);

  const [
    total,
    inPeriod,
    inPrevious,
    verified,
    completed,
    byYear,
    byDegree,
    bySpecialization,
    byProvider,
    graduating,
  ] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "student", createdAt: { $gte: from } }),
    User.countDocuments({ role: "student", createdAt: { $gte: previousFrom, $lt: from } }),
    User.countDocuments({ role: "student", emailVerified: true }),
    StudentProfile.countDocuments({ profileCompleted: true }),
    StudentProfile.aggregate<{ _id: number | null; count: number }>([
      { $match: { currentYear: { $ne: null } } },
      { $group: { _id: "$currentYear", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    StudentProfile.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$degree", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    StudentProfile.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$specialization", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    User.aggregate<{ _id: string | null; count: number }>([
      { $match: { role: "student" } },
      { $group: { _id: "$authProvider", count: { $sum: 1 } } },
    ]),
    StudentProfile.aggregate<{ _id: number; count: number }>([
      { $match: { studyStatus: "studying" } },
      { $group: { _id: "$graduationYear", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 10 },
    ]),
  ]);

  return {
    total,
    inPeriod,
    inPrevious,
    verified,
    completed,
    byYear: byYear
      .filter((row) => row._id)
      .map((row) => ({ label: `Year ${row._id}`, value: row.count })),
    byDegree: byDegree.map((row) => ({ label: row._id ?? "Unspecified", value: row.count })),
    bySpecialization: bySpecialization.map((row) => ({
      label: row._id ?? "Unspecified",
      value: row.count,
    })),
    byProvider: byProvider.map((row) => ({
      label: row._id === "google" ? "Google" : "Email",
      value: row.count,
    })),
    graduating: graduating.map((row) => ({ label: String(row._id), value: row.count })),
  };
}

// ── Institutions ───────────────────────────────────────────────────────────

export async function getInstitutionAnalytics() {
  await connectDB();
  const active = { status: { $ne: "archived" as const } };

  const [byType, byManagement, byAutonomy, byVerification, bySource, topUniversities, topColleges] =
    await Promise.all([
      College.aggregate<{ _id: string; count: number }>([
        { $match: active },
        { $group: { _id: "$institutionType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      College.aggregate<{ _id: string; count: number }>([
        { $match: active },
        { $group: { _id: "$managementType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      College.aggregate<{ _id: string; count: number }>([
        { $match: active },
        { $group: { _id: "$autonomyStatus", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      College.aggregate<{ _id: string; count: number }>([
        { $match: active },
        { $group: { _id: "$verificationStatus", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      College.aggregate<{ _id: string; count: number }>([
        { $match: active },
        { $group: { _id: "$source", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      University.find({ status: "active" })
        .select("name shortName collegeCount stateName")
        .sort({ collegeCount: -1 })
        .limit(12)
        .lean(),
      College.find(active)
        .select("name studentCount stateName districtName")
        .sort({ studentCount: -1 })
        .limit(12)
        .lean(),
    ]);

  return {
    byType: byType.map((row) => ({ label: row._id ?? "Unspecified", value: row.count })),
    byManagement: byManagement.map((row) => ({ label: row._id ?? "Unspecified", value: row.count })),
    byAutonomy: byAutonomy.map((row) => ({ label: row._id ?? "Unspecified", value: row.count })),
    byVerification: byVerification.map((row) => ({
      label: row._id ?? "Unspecified",
      value: row.count,
    })),
    bySource: bySource.map((row) => ({ label: row._id ?? "Unspecified", value: row.count })),
    topUniversities: topUniversities.map((row) => ({
      id: String(row._id),
      label: row.shortName || row.name,
      value: row.collegeCount ?? 0,
    })),
    topColleges: topColleges.map((row) => ({
      id: String(row._id),
      label: row.name,
      value: row.studentCount ?? 0,
      sub: [row.districtName, row.stateName].filter(Boolean).join(", "),
    })),
  };
}

// ── Geography ──────────────────────────────────────────────────────────────

export type GeoNode = {
  label: string;
  colleges: number;
  students: number;
  href: string;
};

/**
 * State → district → city drill-down (spec §25).
 *
 * The level is decided by which parameters are present rather than by a mode
 * flag, so a URL is self-describing: `?state=Telangana&district=Hyderabad`
 * means the city level, and nothing else has to be passed along.
 */
export async function getGeographyBreakdown(params: SearchParams): Promise<{
  level: "state" | "district" | "city";
  state: string | null;
  district: string | null;
  nodes: GeoNode[];
  totals: { colleges: number; students: number };
}> {
  await connectDB();

  const state = readParam(params, "state") ?? null;
  const district = readParam(params, "district") ?? null;
  const level: "state" | "district" | "city" = district ? "city" : state ? "district" : "state";

  const match: Record<string, unknown> = { status: { $ne: "archived" } };
  if (state) match.stateName = state;
  if (district) match.districtName = district;

  const groupField =
    level === "state" ? "$stateName" : level === "district" ? "$districtName" : "$cityName";

  const rows = await College.aggregate<{ _id: string | null; colleges: number; students: number }>([
    { $match: match },
    {
      $group: {
        _id: groupField,
        colleges: { $sum: 1 },
        // Summed from the denormalised counter rather than joined to profiles:
        // this is a breakdown, and the counter is maintained by a job that runs
        // often enough for the shape of the answer to be right.
        students: { $sum: { $ifNull: ["$studentCount", 0] } },
      },
    },
    { $sort: { students: -1, colleges: -1 } },
    { $limit: 60 },
  ]);

  const nodes = rows
    .filter((row) => row._id)
    .map((row) => {
      const label = row._id as string;
      const href =
        level === "state"
          ? `/admin/analytics/geography?state=${encodeURIComponent(label)}`
          : level === "district"
            ? `/admin/analytics/geography?state=${encodeURIComponent(state!)}&district=${encodeURIComponent(label)}`
            : `/admin/colleges?state=${encodeURIComponent(state!)}&district=${encodeURIComponent(district!)}`;
      return { label, colleges: row.colleges, students: row.students, href };
    });

  return {
    level,
    state,
    district,
    nodes,
    totals: {
      colleges: nodes.reduce((sum, node) => sum + node.colleges, 0),
      students: nodes.reduce((sum, node) => sum + node.students, 0),
    },
  };
}
