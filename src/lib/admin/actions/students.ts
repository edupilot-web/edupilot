"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { newBatchId, recordAudit } from "@/lib/admin/audit";
import { requirePermission } from "@/lib/admin/current-admin";
import { User } from "@/models/User";
import { StudentProfile } from "@/models/StudentProfile";

export type BulkState = { ok?: boolean; message?: string; error?: string };

const GENERIC_FAILURE = "Something went wrong on our end. The change was not saved.";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Verify or reject a student from the detail page or the queue.
 *
 * "Verify" here sets `emailVerified`, which is the only verification state a
 * student record currently has. Marking it by hand is a support action — the
 * student proved the address some other way — and it is recorded as `critical`
 * in the audit log for exactly that reason.
 */
export async function verifyStudentAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const decision = text(formData, "decision");
  const note = text(formData, "note");
  const admin = await requirePermission("student.verify", `/admin/students/${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) return;

  try {
    await connectDB();
    const user = await User.findById(id).select("name email emailVerified role").lean();
    if (!user || user.role !== "student") return;

    const verified = decision === "verify";

    await User.updateOne({ _id: id }, { $set: { emailVerified: verified } });

    await recordAudit({
      actor: admin,
      action: verified ? "student.verify" : "student.reject",
      entityType: "StudentProfile",
      entityId: id,
      entityLabel: user.name,
      before: { emailVerified: user.emailVerified === true },
      after: { emailVerified: verified },
      metadata: note ? { note } : null,
    });
  } catch (err) {
    console.error("[admin] could not record the student verification decision:", err);
  }

  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  revalidatePath("/admin/verification");
}

/**
 * Bulk actions on students (spec §32).
 *
 * Deletion is not offered. A student account is referenced by enrollments,
 * profiles and audit rows, and a platform holding personal data needs deletion
 * to be a deliberate, single-record act with its own confirmation — not
 * something reachable from a checkbox column.
 */
export async function bulkStudentAction(
  _prevState: BulkState | undefined,
  formData: FormData
): Promise<BulkState> {
  const action = text(formData, "action");
  const ids = formData
    .getAll("ids")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => mongoose.Types.ObjectId.isValid(value));

  if (!action) return { error: "No action was chosen." };
  if (ids.length === 0) return { error: "No rows were selected." };
  if (ids.length > 500) return { error: "Select at most 500 rows at a time." };

  const permission =
    action === "verify" || action === "unverify" ? "student.verify" : "student.suspend";
  const admin = await requirePermission(permission, "/admin/students");

  try {
    await connectDB();

    const users = await User.find({ _id: { $in: ids }, role: "student" })
      .select("name emailVerified")
      .lean();
    if (users.length === 0) return { error: "Those rows no longer exist." };

    const batchId = newBatchId();
    let update: Record<string, unknown>;
    let auditAction: string;

    switch (action) {
      case "verify":
        update = { emailVerified: true };
        auditAction = "student.verify";
        break;
      case "unverify":
        update = { emailVerified: false };
        auditAction = "student.reject";
        break;
      default:
        return { error: "That action is not recognised." };
    }

    await User.updateMany({ _id: { $in: ids }, role: "student" }, { $set: update });

    await Promise.all(
      users.map((user) =>
        recordAudit({
          actor: admin,
          action: auditAction,
          entityType: "StudentProfile",
          entityId: String(user._id),
          entityLabel: user.name,
          before: { emailVerified: user.emailVerified === true },
          after: update,
          batchId,
          metadata: { bulk: true, selectionSize: ids.length },
        })
      )
    );

    revalidatePath("/admin/students");
    revalidatePath("/admin/verification");

    return {
      ok: true,
      message: `${users.length} ${users.length === 1 ? "student" : "students"} updated.`,
    };
  } catch (err) {
    console.error("[admin] bulk student action failed:", err);
    return { error: GENERIC_FAILURE };
  }
}

/**
 * Recomputes `profileCompleted` for one student.
 *
 * Offered on the detail page because a profile can be left stale by a data fix
 * applied outside the app — an import, a migration, a hand-edited document. The
 * flag is derived, so the repair is to re-derive it rather than to set it.
 */
export async function recomputeProfileAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const admin = await requirePermission("student.edit", `/admin/students/${id}`);
  if (!mongoose.Types.ObjectId.isValid(id)) return;

  try {
    await connectDB();
    const profile = await StudentProfile.findOne({ userId: id });
    if (!profile) return;

    const { isProfileComplete } = await import("@/models/StudentProfile");
    const recomputed = isProfileComplete(profile);
    if (recomputed === profile.profileCompleted) return;

    const before = profile.profileCompleted;
    profile.profileCompleted = recomputed;
    await profile.save();

    await recordAudit({
      actor: admin,
      action: "student.profile.recompute",
      entityType: "StudentProfile",
      entityId: id,
      entityLabel: profile.collegeName,
      before: { profileCompleted: before },
      after: { profileCompleted: recomputed },
    });
  } catch (err) {
    console.error("[admin] could not recompute the profile flag:", err);
  }

  revalidatePath(`/admin/students/${id}`);
}
