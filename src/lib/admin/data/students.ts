import mongoose, { type QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { User, type UserDoc } from "@/models/User";
import { StudentProfile } from "@/models/StudentProfile";
import { College } from "@/models/College";
import { AuditLog } from "@/models/AuditLog";
import { Enrollment } from "@/models/Enrollment";
import { maskEmail, maskPhone } from "@/lib/admin/format";
import { AUTH_PROVIDERS } from "@/lib/user-fields";
import {
  containsRegex,
  readDateRange,
  readEnumList,
  readList,
  readPagination,
  readParam,
  readSort,
  toMongoSort,
  type SearchParams,
} from "@/lib/admin/query";

export const STUDENT_SORT_FIELDS = ["name", "email", "createdAt", "updatedAt"] as const;

export const STUDENT_FILTER_KEYS = [
  "verification",
  "profile",
  "status",
  "provider",
  "college",
  "state",
  "year",
  "created",
] as const;

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  collegeName: string | null;
  collegeId: string | null;
  universityName: string | null;
  degree: string | null;
  specialization: string | null;
  currentYear: number | null;
  graduationYear: number | null;
  profileCompleted: boolean;
  emailVerified: boolean;
  authProvider: string;
  status: string;
  createdAt: Date;
  lastActiveAt: Date | null;
};

/**
 * Students are two collections — `users` and `studentProfiles` — and the list
 * filters on both. The query starts wherever the filter is most selective:
 *
 * - A profile filter (college, year, completion) resolves ids from
 *   `studentProfiles` first, then fetches those users.
 * - Otherwise the user query leads and profiles are looked up for the page.
 *
 * The alternative, one `$lookup` aggregation for every request, does the join
 * for rows the filter is about to discard.
 */
export function buildStudentFilter(params: SearchParams): QueryFilter<UserDoc> {
  const filter: QueryFilter<UserDoc> = { role: "student" };

  const query = readParam(params, "q")?.trim();
  if (query) {
    const term = containsRegex(query);
    filter.$or = [{ name: term }, { email: term }, { phone: term }];
  }

  const verification = readList(params, "verification");
  if (verification.includes("verified") && !verification.includes("unverified")) {
    filter.emailVerified = true;
  } else if (verification.includes("unverified") && !verification.includes("verified")) {
    filter.emailVerified = false;
  }

  const providers = readEnumList(params, "provider", AUTH_PROVIDERS);
  if (providers.length) filter.authProvider = { $in: providers };

  const created = readDateRange(params, "created");
  if (created) filter.createdAt = created;

  return filter;
}

function buildProfileFilter(params: SearchParams): Record<string, unknown> | null {
  const profileFilter: Record<string, unknown> = {};

  const profile = readParam(params, "profile");
  if (profile === "complete") profileFilter.profileCompleted = true;
  if (profile === "incomplete") profileFilter.profileCompleted = false;

  const collegeIds = readList(params, "college").filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (collegeIds.length) {
    profileFilter.collegeId = { $in: collegeIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const years = readList(params, "year")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
  if (years.length) profileFilter.currentYear = { $in: years };

  return Object.keys(profileFilter).length ? profileFilter : null;
}

export async function listStudents(
  params: SearchParams,
  /** Contact details are masked unless the admin holds `student.view_pii`. */
  canSeeContactDetails: boolean
): Promise<{ rows: StudentRow[]; total: number; page: number; limit: number }> {
  await connectDB();

  const { page, limit, skip } = readPagination(params);
  const sort = readSort(params, STUDENT_SORT_FIELDS, { field: "createdAt", direction: -1 });
  const userFilter = buildStudentFilter(params);
  const profileFilter = buildProfileFilter(params);

  // A state filter is a property of the student's *college*, so it resolves
  // through colleges into profiles before touching users at all.
  const states = readList(params, "state");
  if (states.length) {
    const collegeIds = await College.find({ stateName: { $in: states } })
      .select("_id")
      .limit(5000)
      .lean();
    const ids = collegeIds.map((row) => row._id);
    if (profileFilter) {
      const existing = profileFilter.collegeId as { $in: mongoose.Types.ObjectId[] } | undefined;
      profileFilter.collegeId = existing
        ? { $in: existing.$in.filter((id) => ids.some((other) => other.equals(id))) }
        : { $in: ids };
    } else {
      return listByProfile(userFilter, { collegeId: { $in: ids } }, sort, skip, limit, page, canSeeContactDetails);
    }
  }

  if (profileFilter) {
    return listByProfile(userFilter, profileFilter, sort, skip, limit, page, canSeeContactDetails);
  }

  const [users, total] = await Promise.all([
    User.find(userFilter)
      .select("name email phone emailVerified authProvider createdAt updatedAt")
      .sort(toMongoSort(sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(userFilter),
  ]);

  const profiles = await StudentProfile.find({ userId: { $in: users.map((user) => user._id) } })
    .select("userId collegeId collegeName degree specialization currentYear graduationYear profileCompleted updatedAt")
    .lean();

  return {
    total,
    page,
    limit,
    rows: users.map((user) => {
      const profile = profiles.find((entry) => String(entry.userId) === String(user._id));
      return toRow(user, profile, canSeeContactDetails);
    }),
  };
}

async function listByProfile(
  userFilter: QueryFilter<UserDoc>,
  profileFilter: Record<string, unknown>,
  sort: { field: string; direction: 1 | -1 },
  skip: number,
  limit: number,
  page: number,
  canSeeContactDetails: boolean
) {
  // Cap the id set so a filter matching hundreds of thousands of profiles does
  // not build an `$in` the server has to parse. Beyond this the honest answer
  // is a narrower filter, and the footer count says so.
  const MAX_IDS = 20_000;

  const matching = await StudentProfile.find(profileFilter)
    .select("userId")
    .limit(MAX_IDS)
    .lean();
  const userIds = matching.map((row) => row.userId);

  const combined: QueryFilter<UserDoc> = { ...userFilter, _id: { $in: userIds } };

  const [users, total] = await Promise.all([
    User.find(combined)
      .select("name email phone emailVerified authProvider createdAt updatedAt")
      .sort(toMongoSort(sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(combined),
  ]);

  const profiles = await StudentProfile.find({ userId: { $in: users.map((user) => user._id) } })
    .select("userId collegeId collegeName degree specialization currentYear graduationYear profileCompleted updatedAt")
    .lean();

  return {
    total,
    page,
    limit,
    rows: users.map((user) => {
      const profile = profiles.find((entry) => String(entry.userId) === String(user._id));
      return toRow(user, profile, canSeeContactDetails);
    }),
  };
}

type ProfileLean = {
  collegeId?: mongoose.Types.ObjectId | null;
  collegeName?: string;
  degree?: string;
  specialization?: string;
  currentYear?: number | null;
  graduationYear?: number;
  profileCompleted?: boolean;
  updatedAt?: Date;
};

function toRow(
  user: {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    phone?: string | null;
    emailVerified?: boolean;
    authProvider?: string;
    createdAt: Date;
    updatedAt: Date;
  },
  profile: ProfileLean | undefined,
  canSeeContactDetails: boolean
): StudentRow {
  return {
    id: String(user._id),
    name: user.name,
    // Masked in the *data layer*, not in the component. A permission enforced
    // only in JSX is one `console.log` or one new table away from leaking.
    email: canSeeContactDetails ? user.email : maskEmail(user.email),
    phone: user.phone ? (canSeeContactDetails ? user.phone : maskPhone(user.phone)) : null,
    collegeName: profile?.collegeName ?? null,
    collegeId: profile?.collegeId ? String(profile.collegeId) : null,
    universityName: null,
    degree: profile?.degree ?? null,
    specialization: profile?.specialization ?? null,
    currentYear: profile?.currentYear ?? null,
    graduationYear: profile?.graduationYear ?? null,
    profileCompleted: profile?.profileCompleted === true,
    emailVerified: user.emailVerified === true,
    authProvider: user.authProvider ?? "email",
    status: "active",
    createdAt: user.createdAt,
    lastActiveAt: profile?.updatedAt ?? user.updatedAt,
  };
}

/** Everything the student detail page shows. */
export async function getStudentDetail(id: string, canSeeContactDetails: boolean) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  await connectDB();

  const user = await User.findById(id)
    .select("name email phone city avatarUrl emailVerified authProvider role createdAt updatedAt")
    .lean();
  if (!user || user.role !== "student") return null;

  const [profile, audit, enrollments] = await Promise.all([
    StudentProfile.findOne({ userId: user._id }).lean(),
    AuditLog.find({ entityType: "StudentProfile", entityId: user._id })
      .select("actorName action before after createdAt")
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    Enrollment.countDocuments({ student: user._id }),
  ]);

  const college = profile?.collegeId
    ? await College.findById(profile.collegeId)
        .select("name universityName universityId stateName districtName verificationStatus")
        .lean()
    : null;

  /** Which onboarding fields are still missing, for the completion meter. */
  const missing: string[] = [];
  if (!profile) missing.push("Onboarding not started");
  else {
    if (!profile.collegeName) missing.push("College");
    if (!profile.degree) missing.push("Degree");
    if (!profile.specialization) missing.push("Specialization");
    if (profile.studyStatus !== "graduated" && !profile.currentYear) missing.push("Current year");
    if (!profile.graduationYear) missing.push("Graduation year");
  }
  if (!user.phone) missing.push("Phone number");
  if (!user.avatarUrl) missing.push("Profile photo");

  // Required onboarding fields are five; the two optional ones are counted but
  // weighted lower, so a finished profile does not sit at 71% forever.
  const requiredMissing = missing.filter(
    (entry) => !["Phone number", "Profile photo"].includes(entry)
  ).length;
  const completion = Math.round(((5 - Math.min(5, requiredMissing)) / 5) * 90 + (user.phone ? 5 : 0) + (user.avatarUrl ? 5 : 0));

  return {
    id: String(user._id),
    name: user.name,
    email: canSeeContactDetails ? user.email : maskEmail(user.email),
    emailMasked: !canSeeContactDetails,
    phone: user.phone ? (canSeeContactDetails ? user.phone : maskPhone(user.phone)) : null,
    city: user.city ?? null,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified === true,
    authProvider: user.authProvider ?? "email",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profile: profile
      ? {
          collegeId: profile.collegeId ? String(profile.collegeId) : null,
          collegeName: profile.collegeName,
          degree: profile.degree,
          specialization: profile.specialization,
          studyStatus: profile.studyStatus,
          currentYear: profile.currentYear ?? null,
          graduationYear: profile.graduationYear,
          profileCompleted: profile.profileCompleted,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      : null,
    college: college
      ? {
          id: String(college._id),
          name: college.name,
          universityName: college.universityName ?? null,
          universityId: college.universityId ? String(college.universityId) : null,
          stateName: college.stateName ?? null,
          districtName: college.districtName ?? null,
          verificationStatus: college.verificationStatus,
        }
      : null,
    completion: Math.min(100, completion),
    missing,
    enrollments,
    audit: audit.map((row) => ({
      id: String(row._id),
      actor: row.actorName ?? "System",
      action: row.action,
      at: row.createdAt,
    })),
  };
}

/** Counts for the student list's filter chips. */
export async function getStudentFacets() {
  await connectDB();

  const [total, verified, complete, google] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "student", emailVerified: true }),
    StudentProfile.countDocuments({ profileCompleted: true }),
    User.countDocuments({ role: "student", authProvider: "google" }),
  ]);

  return { total, verified, unverified: total - verified, complete, incomplete: total - complete, google };
}
