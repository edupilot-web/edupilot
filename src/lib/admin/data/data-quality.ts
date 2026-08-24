import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { University } from "@/models/University";
import { StudentProfile } from "@/models/StudentProfile";
import { Affiliation } from "@/models/Affiliation";
import { PINCODE_PATTERN } from "@/models/Geo";

/**
 * The data-quality queue (spec §34).
 *
 * Every check is a *query with a fix attached*, not a score. A dashboard that
 * says "data quality: 82%" tells an operator nothing they can act on; a row
 * that says "37 colleges have no affiliating university → open them" is work
 * they can start.
 *
 * Checks are ranked by `severity` and then by count, so the queue puts the
 * damaging problems above the cosmetic ones. Duplicate colleges break student
 * onboarding; a missing website does not.
 */
export type QualityCheck = {
  key: string;
  label: string;
  /** What goes wrong because of it, in the operator's terms. */
  consequence: string;
  count: number;
  severity: "high" | "medium" | "low";
  /** Where to go to fix it. */
  href: string;
  fix: string;
};

export async function getQualityChecks(): Promise<QualityCheck[]> {
  await connectDB();

  const active = { status: { $ne: "archived" as const } };

  const [
    missingUniversity,
    missingDistrict,
    invalidPincode,
    missingCode,
    missingWebsite,
    unverified,
    studentAdded,
    conflictingAffiliations,
    orphanProfiles,
    incompleteProfiles,
    universitiesWithoutState,
  ] = await Promise.all([
    College.countDocuments({ ...active, universityId: null }),
    College.countDocuments({ ...active, $or: [{ districtName: null }, { districtName: "" }] }),
    // Anything present that is not six digits starting 1–9. An *absent* pincode
    // is counted separately; "wrong" and "missing" need different fixes.
    College.countDocuments({
      ...active,
      pincode: { $nin: [null, ""], $not: PINCODE_PATTERN },
    }),
    College.countDocuments({ ...active, $or: [{ code: null }, { code: { $exists: false } }] }),
    College.countDocuments({ ...active, $or: [{ website: null }, { website: "" }] }),
    College.countDocuments({ ...active, verificationStatus: "not-verified" }),
    College.countDocuments({ ...active, source: "student", verificationStatus: "not-verified" }),
    // More than one live affiliation is the invariant the writers maintain; a
    // count above zero here means something wrote around them.
    Affiliation.aggregate<{ _id: unknown }>([
      { $match: { status: "active" } },
      { $group: { _id: "$collegeId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: "total" },
    ]).then((rows) => (rows[0] as unknown as { total: number } | undefined)?.total ?? 0),
    // A profile naming a college that no longer exists.
    StudentProfile.countDocuments({ collegeId: null, collegeName: { $nin: [null, ""] } }),
    StudentProfile.countDocuments({ profileCompleted: false }),
    University.countDocuments({ status: { $ne: "archived" }, stateName: null }),
  ]);

  const checks: QualityCheck[] = [
    {
      key: "conflicting-affiliations",
      label: "Colleges with more than one active affiliation",
      consequence:
        "The college header and its timeline disagree about which university it belongs to.",
      count: conflictingAffiliations,
      severity: "high",
      href: "/admin/affiliations?status=active",
      fix: "Close all but the current period on each affected college.",
    },
    {
      key: "orphan-profiles",
      label: "Student profiles naming a college that is not in the directory",
      consequence:
        "Those students cannot be counted in any college or state figure, and their college shows no link.",
      count: orphanProfiles,
      severity: "high",
      href: "/admin/students?profile=incomplete",
      fix: "Add the missing colleges, then re-run the college linking job.",
    },
    {
      key: "student-added",
      label: "Colleges added by students and never reviewed",
      consequence:
        "Unreviewed names are the main source of near-duplicates in the directory students pick from.",
      count: studentAdded,
      severity: "high",
      href: "/admin/colleges?source=student&verification=not-verified",
      fix: "Review each one: merge it into an existing college, or verify it.",
    },
    {
      key: "missing-university",
      label: "Active colleges with no affiliating university",
      consequence:
        "They are missing from every university breakdown, and a student's degree cannot be attributed.",
      count: missingUniversity,
      severity: "high",
      href: "/admin/colleges?q=&university=",
      fix: "Set the affiliating university on each; this opens an affiliation period.",
    },
    {
      key: "missing-district",
      label: "Colleges with no district",
      consequence: "They vanish from geographic analytics and district filters.",
      count: missingDistrict,
      severity: "medium",
      href: "/admin/colleges",
      fix: "Set the district from the college's edit screen.",
    },
    {
      key: "invalid-pincode",
      label: "Colleges with an invalid pincode",
      consequence: "A malformed pincode breaks postal lookups and any future map placement.",
      count: invalidPincode,
      severity: "medium",
      href: "/admin/colleges",
      fix: "Correct it to six digits, or clear it if it is not known.",
    },
    {
      key: "unverified",
      label: "Colleges never put through verification",
      consequence:
        "Students see no verified badge, and the directory's accuracy is unattested.",
      count: unverified,
      severity: "medium",
      href: "/admin/colleges?verification=not-verified",
      fix: "Work them through the verification queue.",
    },
    {
      key: "universities-no-state",
      label: "Universities with no state",
      consequence: "They are excluded from the state filter on the college form.",
      count: universitiesWithoutState,
      severity: "medium",
      href: "/admin/universities",
      fix: "Set the state on each university.",
    },
    {
      key: "incomplete-profiles",
      label: "Students who have not finished onboarding",
      consequence:
        "Not a data fault — but a large number here means the onboarding flow is losing people.",
      count: incompleteProfiles,
      severity: "low",
      href: "/admin/students?profile=incomplete",
      fix: "Send a reminder campaign, or look at where the funnel drops.",
    },
    {
      key: "missing-code",
      label: "Colleges with no college code",
      consequence: "Imports cannot match on code, so they fall back to fuzzy name matching.",
      count: missingCode,
      severity: "low",
      href: "/admin/colleges",
      fix: "Add the AICTE or university code where it is known.",
    },
    {
      key: "missing-website",
      label: "Colleges with no website",
      consequence: "Nothing breaks. The college profile is simply thinner for students.",
      count: missingWebsite,
      severity: "low",
      href: "/admin/colleges",
      fix: "Fill in from the college's own site, or leave it.",
    },
  ];

  const order = { high: 0, medium: 1, low: 2 };
  return checks
    .filter((check) => check.count > 0)
    .sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}

export type DuplicateGroup = {
  key: string;
  colleges: {
    id: string;
    name: string;
    districtName: string | null;
    stateName: string | null;
    universityName: string | null;
    studentCount: number;
    source: string;
    verificationStatus: string;
  }[];
};

/**
 * Likely duplicate colleges.
 *
 * Grouped by the first four words of the normalised name plus the district.
 * Crude on purpose: the unique index already makes exact duplicates impossible,
 * so what is left is the near-miss — "Sri Chaitanya Institute of Technology"
 * and "Sri Chaitanya Institute of Technology and Science" in the same town —
 * and a cheap prefix group finds those without a similarity scan across the
 * whole collection.
 */
export async function findDuplicateColleges(limit = 25): Promise<DuplicateGroup[]> {
  await connectDB();

  const groups = await College.aggregate<{
    _id: string;
    colleges: {
      _id: unknown;
      name: string;
      districtName: string | null;
      stateName: string | null;
      universityName: string | null;
      studentCount: number;
      source: string;
      verificationStatus: string;
    }[];
  }>([
    { $match: { status: { $ne: "archived" } } },
    {
      $addFields: {
        prefix: {
          $concat: [
            {
              $reduce: {
                input: { $slice: [{ $split: ["$normalizedName", " "] }, 4] },
                initialValue: "",
                in: { $concat: ["$$value", " ", "$$this"] },
              },
            },
            "|",
            { $ifNull: ["$districtName", "?"] },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$prefix",
        colleges: {
          $push: {
            _id: "$_id",
            name: "$name",
            districtName: "$districtName",
            stateName: "$stateName",
            universityName: "$universityName",
            studentCount: "$studentCount",
            source: "$source",
            verificationStatus: "$verificationStatus",
          },
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  return groups.map((group) => ({
    key: group._id,
    colleges: group.colleges.map((college) => ({
      id: String(college._id),
      name: college.name,
      districtName: college.districtName ?? null,
      stateName: college.stateName ?? null,
      universityName: college.universityName ?? null,
      studentCount: college.studentCount ?? 0,
      source: college.source,
      verificationStatus: college.verificationStatus,
    })),
  }));
}
