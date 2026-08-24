import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { University } from "@/models/University";
import { User } from "@/models/User";
import { StudentProfile } from "@/models/StudentProfile";
import { AWAITING_VERIFICATION } from "@/lib/admin/institution-fields";
import { readPagination, readParam, type SearchParams } from "@/lib/admin/query";

/**
 * The verification queue (spec §19).
 *
 * One queue over three entity types rather than three separate screens: an
 * operator's job is "clear the backlog", not "clear the college backlog and
 * then remember there is a student one". Each tab is a separate query, because
 * the three collections have nothing to join on and a `$unionWith` would be
 * slower than two round trips.
 */
export type QueueKind = "colleges" | "universities" | "students";

export type QueueItem = {
  id: string;
  kind: QueueKind;
  title: string;
  subtitle: string | null;
  detail: string | null;
  status: string;
  /** When it entered the queue, for the "waiting since" column. */
  waitingSince: Date | null;
  href: string;
  /** Why it needs looking at, when that is not obvious. */
  reason: string | null;
};

export async function getQueueCounts(): Promise<Record<QueueKind, number>> {
  await connectDB();

  const [colleges, universities, students] = await Promise.all([
    College.countDocuments({
      status: { $ne: "archived" },
      verificationStatus: { $in: AWAITING_VERIFICATION },
    }),
    University.countDocuments({
      status: { $ne: "archived" },
      verificationStatus: { $in: AWAITING_VERIFICATION },
    }),
    // A student "in the queue" is one who registered but never confirmed their
    // address. There is no separate submission for an admin to approve, so the
    // queue is the set an admin might choose to verify by hand.
    User.countDocuments({ role: "student", emailVerified: false }),
  ]);

  return { colleges, universities, students };
}

export async function listQueue(
  kind: QueueKind,
  params: SearchParams
): Promise<{ items: QueueItem[]; total: number; page: number; limit: number }> {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  if (kind === "universities") {
    const filter = {
      status: { $ne: "archived" as const },
      verificationStatus: { $in: AWAITING_VERIFICATION },
    };
    const [docs, total] = await Promise.all([
      University.find(filter)
        .select("name shortName type stateName districtName verificationStatus updatedAt collegeCount")
        .sort({ updatedAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      University.countDocuments(filter),
    ]);

    return {
      total,
      page,
      limit,
      items: docs.map((doc) => ({
        id: String(doc._id),
        kind,
        title: doc.name,
        subtitle: [doc.type, doc.stateName].filter(Boolean).join(" · ") || null,
        detail: `${doc.collegeCount ?? 0} colleges`,
        status: doc.verificationStatus,
        waitingSince: doc.updatedAt,
        href: `/admin/universities/${doc._id}`,
        reason: null,
      })),
    };
  }

  if (kind === "students") {
    const filter = { role: "student" as const, emailVerified: false };
    const [docs, total] = await Promise.all([
      User.find(filter)
        .select("name email createdAt authProvider")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const profiles = await StudentProfile.find({ userId: { $in: docs.map((doc) => doc._id) } })
      .select("userId collegeName profileCompleted")
      .lean();

    return {
      total,
      page,
      limit,
      items: docs.map((doc) => {
        const profile = profiles.find((entry) => String(entry.userId) === String(doc._id));
        return {
          id: String(doc._id),
          kind,
          title: doc.name,
          // The queue is worked by people with `student.verify`, which the
          // Student Admin role holds alongside `student.view_pii`; the address
          // is the thing being verified, so hiding it would make the queue
          // unusable. The list screen masks it for everyone else.
          subtitle: doc.email,
          detail: profile?.collegeName ?? "No college selected",
          status: "pending",
          waitingSince: doc.createdAt,
          href: `/admin/students/${doc._id}`,
          reason:
            doc.authProvider === "google"
              ? "Signed up with Google but the address came back unverified"
              : "Never followed the verification link",
        };
      }),
    };
  }

  const filter = {
    status: { $ne: "archived" as const },
    verificationStatus: { $in: AWAITING_VERIFICATION },
  };
  const [docs, total] = await Promise.all([
    College.find(filter)
      .select(
        "name code universityName stateName districtName verificationStatus verificationRequestedAt updatedAt source studentCount autonomyStatus"
      )
      // Oldest first: a queue worked newest-first leaves a tail nobody reaches.
      .sort({ verificationRequestedAt: 1, updatedAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    College.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    items: docs.map((doc) => ({
      id: String(doc._id),
      kind: "colleges" as const,
      title: doc.name,
      subtitle:
        [doc.code, doc.districtName, doc.stateName].filter(Boolean).join(" · ") || null,
      detail: doc.universityName ?? "No affiliating university",
      status: doc.verificationStatus,
      waitingSince: doc.verificationRequestedAt ?? doc.updatedAt,
      href: `/admin/colleges/${doc._id}`,
      reason:
        doc.source === "student"
          ? "Added by a student during onboarding"
          : !doc.universityName
            ? "No affiliating university recorded"
            : null,
    })),
  };
}

export function readQueueKind(params: SearchParams): QueueKind {
  const raw = readParam(params, "kind");
  if (raw === "universities" || raw === "students") return raw;
  return "colleges";
}
