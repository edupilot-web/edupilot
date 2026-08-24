import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { University } from "@/models/University";
import { StudentProfile } from "@/models/StudentProfile";
import { User } from "@/models/User";
import { AuditLog } from "@/models/AuditLog";
import { ImportJob } from "@/models/ImportJob";
import { State } from "@/models/Geo";
import { percentChange } from "@/lib/admin/format";
import { AWAITING_VERIFICATION } from "@/lib/admin/institution-fields";

/**
 * Everything the dashboard shows, gathered in one place.
 *
 * Each figure is a `countDocuments` or a small aggregation against an index —
 * no collection scans. At the scale this is designed for, the honest next step
 * is a nightly rollup collection the dashboard reads instead; the shape of what
 * is returned here would not change, which is why the queries are behind
 * functions rather than inlined in the page.
 */

export type Kpi = {
  label: string;
  value: number;
  delta: number | null;
  hint?: string;
  href?: string;
  tone?: "warning";
};

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * The eight KPI tiles.
 *
 * Every one is compared against the *equivalent preceding window*, not against
 * a calendar month: "last 30 days vs the 30 before that" is a like-for-like
 * comparison on any day of the month, where "vs last month" silently means
 * something different on the 2nd than on the 28th.
 */
export async function getDashboardKpis(): Promise<Kpi[]> {
  await connectDB();

  const now = new Date();
  const window30 = daysAgo(30);
  const window60 = daysAgo(60);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeCutoff = daysAgo(30);

  const [
    totalStudents,
    studentsPrior,
    studentsThis,
    activeStudents,
    activePrior,
    totalColleges,
    collegesThis,
    collegesPrior,
    verifiedColleges,
    pendingColleges,
    registeredToday,
    completedProfiles,
  ] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "student", createdAt: { $gte: window60, $lt: window30 } }),
    User.countDocuments({ role: "student", createdAt: { $gte: window30 } }),
    // "Active" is a profile touched in the last 30 days. The platform has no
    // session table yet, so `updatedAt` is the closest honest proxy — noted on
    // the tile rather than presented as a login count.
    StudentProfile.countDocuments({ updatedAt: { $gte: activeCutoff } }),
    StudentProfile.countDocuments({ updatedAt: { $gte: window60, $lt: window30 } }),
    College.countDocuments({ status: "active" }),
    College.countDocuments({ status: "active", createdAt: { $gte: window30 } }),
    College.countDocuments({ status: "active", createdAt: { $gte: window60, $lt: window30 } }),
    College.countDocuments({ status: "active", verificationStatus: "verified" }),
    College.countDocuments({
      status: "active",
      verificationStatus: { $in: AWAITING_VERIFICATION },
    }),
    User.countDocuments({ role: "student", createdAt: { $gte: todayStart } }),
    StudentProfile.countDocuments({ profileCompleted: true }),
  ]);

  const engagement = totalStudents ? (completedProfiles / totalStudents) * 100 : 0;

  return [
    {
      label: "Total Students",
      value: totalStudents,
      delta: percentChange(studentsThis, studentsPrior),
      href: "/admin/students",
    },
    {
      label: "Active Students",
      value: activeStudents,
      delta: percentChange(activeStudents, activePrior),
      hint: "Profile activity in 30 days",
    },
    {
      label: "Total Colleges",
      value: totalColleges,
      delta: percentChange(collegesThis, collegesPrior),
      href: "/admin/colleges",
    },
    {
      label: "Verified Colleges",
      value: verifiedColleges,
      delta: null,
      hint: totalColleges
        ? `${((verifiedColleges / totalColleges) * 100).toFixed(1)}% of the directory`
        : undefined,
      href: "/admin/colleges?verification=verified",
    },
    {
      label: "Pending Verification",
      value: pendingColleges,
      delta: null,
      hint: pendingColleges > 0 ? "Needs attention" : "Queue is clear",
      tone: pendingColleges > 0 ? "warning" : undefined,
      href: "/admin/verification",
    },
    {
      label: "New Registrations",
      value: studentsThis,
      delta: percentChange(studentsThis, studentsPrior),
      hint: "Last 30 days",
      href: "/admin/students?created=30d",
    },
    {
      label: "Registered Today",
      value: registeredToday,
      delta: null,
      hint: `As of ${now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`,
    },
    {
      label: "Profile Completion",
      value: Math.round(engagement),
      delta: null,
      hint: "Percent who finished onboarding",
    },
  ];
}

export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

/**
 * Student registrations over time.
 *
 * One `$group` on a truncated `createdAt`, which MongoDB can serve from the
 * index. Missing buckets are filled in afterwards: a gap in the series would
 * make a quiet week look like a week that never happened.
 */
export async function getStudentGrowth(
  granularity: Granularity = "daily"
): Promise<{ label: string; value: number }[]> {
  await connectDB();

  const config: Record<Granularity, { unit: "day" | "week" | "month" | "year"; count: number }> = {
    daily: { unit: "day", count: 30 },
    weekly: { unit: "week", count: 12 },
    monthly: { unit: "month", count: 12 },
    yearly: { unit: "year", count: 5 },
  };

  const { unit, count } = config[granularity];
  const from = new Date();
  if (unit === "day") from.setDate(from.getDate() - count);
  if (unit === "week") from.setDate(from.getDate() - count * 7);
  if (unit === "month") from.setMonth(from.getMonth() - count);
  if (unit === "year") from.setFullYear(from.getFullYear() - count);

  const rows = await User.aggregate<{ _id: Date; value: number }>([
    { $match: { role: "student", createdAt: { $gte: from } } },
    { $group: { _id: { $dateTrunc: { date: "$createdAt", unit } }, value: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const byKey = new Map(rows.map((row) => [row._id.getTime(), row.value]));
  const points: { label: string; value: number }[] = [];
  const cursor = truncate(from, unit);

  while (cursor <= new Date()) {
    points.push({ label: labelFor(cursor, unit), value: byKey.get(cursor.getTime()) ?? 0 });
    advance(cursor, unit);
  }

  return points;
}

/**
 * The registration funnel (spec §3).
 *
 * Every step is a count of a real state, not an estimate. "College Selected"
 * and "Academic Details" are separate because the two onboarding steps write
 * separately, and knowing which of them people abandon is the point.
 */
export async function getRegistrationFunnel(): Promise<
  { label: string; value: number; href?: string }[]
> {
  await connectDB();

  const [registered, verified, withProfile, collegeSelected, completed] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "student", emailVerified: true }),
    StudentProfile.countDocuments({}),
    StudentProfile.countDocuments({ collegeName: { $nin: [null, ""] } }),
    StudentProfile.countDocuments({ profileCompleted: true }),
  ]);

  return [
    { label: "Registered", value: registered, href: "/admin/students" },
    { label: "Email verified", value: verified },
    { label: "Started onboarding", value: withProfile },
    { label: "College selected", value: collegeSelected },
    {
      label: "Academic details completed",
      value: completed,
      href: "/admin/students?profile=complete",
    },
  ];
}

/**
 * Students by state.
 *
 * Resolved through each student's college rather than a field on the student:
 * students do not record their own state, and the college's is the one that is
 * actually maintained. A `$lookup` per dashboard load is acceptable at this
 * size and is the first thing that should become a rollup.
 */
export async function getStudentsByState(
  limit = 8
): Promise<{ label: string; value: number }[]> {
  await connectDB();

  const rows = await StudentProfile.aggregate<{ _id: string | null; value: number }>([
    { $match: { collegeId: { $ne: null } } },
    {
      $lookup: {
        from: "colleges",
        localField: "collegeId",
        foreignField: "_id",
        as: "college",
        pipeline: [{ $project: { stateName: 1 } }],
      },
    },
    { $unwind: { path: "$college", preserveNullAndEmptyArrays: false } },
    { $group: { _id: "$college.stateName", value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: limit },
  ]);

  return rows
    .filter((row) => row._id)
    .map((row) => ({ label: row._id as string, value: row.value }));
}

export async function getCollegesByType(): Promise<{ label: string; value: number }[]> {
  await connectDB();

  const rows = await College.aggregate<{ _id: string; value: number }>([
    { $match: { status: "active" } },
    { $group: { _id: "$managementType", value: { $sum: 1 } } },
    { $sort: { value: -1 } },
  ]);

  return rows.map((row) => ({ label: row._id ?? "Unspecified", value: row.value }));
}

export async function getTopUniversities(
  limit = 8
): Promise<{ label: string; value: number; id: string }[]> {
  await connectDB();

  const rows = await University.find({ status: "active" })
    .select("name shortName collegeCount")
    .sort({ collegeCount: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    label: row.shortName || row.name,
    value: row.collegeCount ?? 0,
  }));
}

export async function getCollegesByState(
  limit = 8
): Promise<{ label: string; value: number }[]> {
  await connectDB();

  const rows = await College.aggregate<{ _id: string | null; value: number }>([
    { $match: { status: "active" } },
    { $group: { _id: "$stateName", value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: limit },
  ]);

  return rows.map((row) => ({ label: row._id ?? "Unassigned", value: row.value }));
}

export type ActivityEntry = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityType: string;
  entityId: string | null;
  at: Date;
  severity: string;
};

/** The most recent administrative actions, for the dashboard feed. */
export async function getRecentActivity(limit = 12): Promise<ActivityEntry[]> {
  await connectDB();

  const rows = await AuditLog.find({})
    .select("actorName action entityType entityId entityLabel createdAt severity actorType")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    actor: row.actorName ?? (row.actorType === "system" ? "System" : "Unknown"),
    action: row.action,
    entity: row.entityLabel ?? row.entityType,
    entityType: row.entityType,
    entityId: row.entityId ? String(row.entityId) : null,
    at: row.createdAt,
    severity: row.severity ?? "info",
  }));
}

/** Anything an operator should act on today, gathered for the dashboard. */
export async function getAttentionItems(): Promise<
  { label: string; count: number; href: string; tone: "warning" | "danger" | "info" }[]
> {
  await connectDB();

  const [pendingColleges, pendingStudents, studentAdded, failedImports, missingUniversity] =
    await Promise.all([
      College.countDocuments({
        status: "active",
        verificationStatus: { $in: AWAITING_VERIFICATION },
      }),
      User.countDocuments({ role: "student", emailVerified: false }),
      College.countDocuments({ source: "student", verificationStatus: "not-verified" }),
      ImportJob.countDocuments({ stage: "failed" }),
      College.countDocuments({ status: "active", universityId: null }),
    ]);

  return [
    {
      label: "Colleges awaiting verification",
      count: pendingColleges,
      href: "/admin/verification",
      tone: "warning" as const,
    },
    {
      label: "Colleges added by students, unreviewed",
      count: studentAdded,
      href: "/admin/data-quality",
      tone: "warning" as const,
    },
    {
      label: "Active colleges with no affiliating university",
      count: missingUniversity,
      href: "/admin/data-quality",
      tone: "info" as const,
    },
    {
      label: "Students with an unconfirmed email address",
      count: pendingStudents,
      href: "/admin/students?verification=unverified",
      tone: "info" as const,
    },
    {
      label: "Failed imports",
      count: failedImports,
      href: "/admin/system/imports",
      tone: "danger" as const,
    },
  ].filter((item) => item.count > 0);
}

/** Launch states first, then the rest — used by filter dropdowns. */
export async function getStates(): Promise<{ id: string; name: string; code: string }[]> {
  await connectDB();
  const rows = await State.find({ active: true })
    .select("name code")
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  return rows.map((row) => ({ id: String(row._id), name: row.name, code: row.code }));
}

// ── Date bucket helpers ────────────────────────────────────────────────────

type Unit = "day" | "week" | "month" | "year";

function truncate(date: Date, unit: Unit): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  if (unit === "week") result.setDate(result.getDate() - result.getDay());
  if (unit === "month") result.setDate(1);
  if (unit === "year") {
    result.setMonth(0);
    result.setDate(1);
  }
  return result;
}

function advance(date: Date, unit: Unit): void {
  if (unit === "day") date.setDate(date.getDate() + 1);
  if (unit === "week") date.setDate(date.getDate() + 7);
  if (unit === "month") date.setMonth(date.getMonth() + 1);
  if (unit === "year") date.setFullYear(date.getFullYear() + 1);
}

function labelFor(date: Date, unit: Unit): string {
  if (unit === "year") return String(date.getFullYear());
  if (unit === "month") return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
