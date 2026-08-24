"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { requirePermission } from "@/lib/admin/current-admin";
import { ALL_PERMISSIONS, SUPER_ADMIN_PERMISSION, isKnownPermission } from "@/lib/admin/permissions";
import { AdminUser } from "@/models/AdminUser";
import { Role } from "@/models/Role";
import { FeatureFlag, Setting } from "@/models/SystemModels";

export type AdminFormState = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const GENERIC_FAILURE = "Something went wrong on our end. The change was not saved.";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

const inviteSchema = z.object({
  name: z.string().min(2, "Enter their full name").max(120),
  email: z
    .string()
    .trim()
    .min(1, "Enter their work email")
    .email("Enter a valid email address")
    .toLowerCase(),
  roleId: z.string().regex(/^[a-f0-9]{24}$/i, "Choose a role"),
  team: z.string().max(80).optional().or(z.literal("")),
  title: z.string().max(120).optional().or(z.literal("")),
});

/**
 * Invites an administrator.
 *
 * The account is created immediately with `status: "invited"` and no password,
 * so it appears in the list from the moment it is sent — an invitation that is
 * invisible until accepted is one nobody can chase or revoke.
 *
 * Only a hash of the invitation token is stored, for the same reason email
 * verification stores only a hash: a database dump must not be a set of working
 * invitations into the admin application.
 */
export async function inviteAdminAction(
  _prevState: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const admin = await requirePermission("admin.invite", "/admin/team");

  const parsed = inviteSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    roleId: text(formData, "roleId"),
    team: text(formData, "team"),
    title: text(formData, "title"),
  });

  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  try {
    await connectDB();

    const existing = await AdminUser.findOne({ email: parsed.data.email }).select("_id").lean();
    if (existing) {
      return { errors: { email: ["That address already has an administrator account."] } };
    }

    const role = await Role.findById(parsed.data.roleId).select("name permissions").lean();
    if (!role) return { errors: { roleId: ["That role no longer exists."] } };

    // Granting a role you do not hold yourself is privilege escalation by
    // proxy. Only someone with the wildcard may hand out the wildcard.
    if (
      role.permissions.includes(SUPER_ADMIN_PERMISSION) &&
      !admin.permissions.includes(SUPER_ADMIN_PERMISSION)
    ) {
      return { errors: { roleId: ["Only a Super Admin can grant the Super Admin role."] } };
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    const created = await AdminUser.create({
      name: parsed.data.name,
      email: parsed.data.email,
      roleId: role._id,
      roleName: role.name,
      team: parsed.data.team || null,
      title: parsed.data.title || null,
      status: "invited",
      inviteTokenHash: createHash("sha256").update(token).digest("hex"),
      inviteExpiresAt: expires,
      invitedBy: admin.id,
      invitedAt: new Date(),
      createdBy: admin.id,
    });

    await Role.updateOne({ _id: role._id }, { $inc: { adminCount: 1 } });

    await recordAudit({
      actor: admin,
      action: "admin.invite",
      entityType: "AdminUser",
      entityId: created._id.toString(),
      entityLabel: created.name,
      after: { email: created.email, roleName: role.name },
      metadata: { expiresAt: expires.toISOString() },
    });
  } catch (err) {
    console.error("[admin] could not invite an administrator:", err);
    return { message: GENERIC_FAILURE };
  }

  revalidatePath("/admin/team");
  redirect("/admin/team?invited=1");
}

/** Changes an administrator's role. */
export async function changeAdminRoleAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const roleId = text(formData, "roleId");
  const admin = await requirePermission("admin.edit", "/admin/team");

  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(roleId)) return;

  try {
    await connectDB();

    const [target, role] = await Promise.all([
      AdminUser.findById(id).select("name roleId roleName").lean(),
      Role.findById(roleId).select("name permissions").lean(),
    ]);
    if (!target || !role) return;

    if (
      role.permissions.includes(SUPER_ADMIN_PERMISSION) &&
      !admin.permissions.includes(SUPER_ADMIN_PERMISSION)
    ) {
      return;
    }

    await AdminUser.updateOne({ _id: id }, { $set: { roleId: role._id, roleName: role.name } });
    await Role.updateOne({ _id: target.roleId }, { $inc: { adminCount: -1 } });
    await Role.updateOne({ _id: role._id }, { $inc: { adminCount: 1 } });

    await recordAudit({
      actor: admin,
      action: "admin.role.change",
      entityType: "AdminUser",
      entityId: id,
      entityLabel: target.name,
      before: { roleName: target.roleName },
      after: { roleName: role.name },
    });
  } catch (err) {
    console.error("[admin] could not change the role:", err);
  }

  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${id}`);
}

/**
 * Suspends, reinstates or deactivates an administrator.
 *
 * An admin cannot act on their own account: locking yourself out is an
 * irreversible mistake from a screen where every other action is reversible.
 */
export async function setAdminStatusAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const status = text(formData, "status");
  const admin = await requirePermission("admin.deactivate", "/admin/team");

  if (!mongoose.Types.ObjectId.isValid(id)) return;
  if (!["active", "suspended", "deactivated"].includes(status)) return;
  if (id === admin.id) return;

  try {
    await connectDB();
    const target = await AdminUser.findById(id).select("name status").lean();
    if (!target) return;

    await AdminUser.updateOne(
      { _id: id },
      {
        $set: {
          status,
          deactivatedAt: status === "deactivated" ? new Date() : null,
          deactivatedBy: status === "deactivated" ? admin.id : null,
          // A reinstated account starts with a clean slate; the old failure
          // count would otherwise lock it again on the next mistyped password.
          ...(status === "active" ? { failedLoginCount: 0, lockedUntil: null } : {}),
        },
      }
    );

    await recordAudit({
      actor: admin,
      action: status === "active" ? "admin.reinstate" : "admin.deactivate",
      entityType: "AdminUser",
      entityId: id,
      entityLabel: target.name,
      before: { status: target.status },
      after: { status },
    });
  } catch (err) {
    console.error("[admin] could not change the administrator's status:", err);
  }

  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${id}`);
}

const roleSchema = z.object({
  name: z.string().min(2, "Give the role a name").max(80),
  description: z.string().max(400).optional().or(z.literal("")),
});

/**
 * Creates or updates a role's permissions.
 *
 * Permissions are validated against the catalogue on the way in. An unknown
 * string is not a security hole — nothing would ever match it — but it would sit
 * in the role editor looking granted, which is worse than being rejected.
 */
export async function saveRoleAction(
  _prevState: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const id = text(formData, "id");
  const admin = await requirePermission("admin.manage_roles", "/admin/roles");

  const parsed = roleSchema.safeParse({
    name: text(formData, "name"),
    description: text(formData, "description"),
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const permissions = formData
    .getAll("permissions")
    .filter((value): value is string => typeof value === "string")
    .filter(isKnownPermission);

  try {
    await connectDB();

    // Only a Super Admin can create another one — see `inviteAdminAction`.
    const wantsWildcard = formData.get("wildcard") === "on";
    if (wantsWildcard && !admin.permissions.includes(SUPER_ADMIN_PERMISSION)) {
      return { message: "Only a Super Admin can create a role with unrestricted access." };
    }

    const finalPermissions = wantsWildcard ? [SUPER_ADMIN_PERMISSION] : permissions;

    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) return { message: "That role could not be found." };

      const existing = await Role.findById(id).lean();
      if (!existing) return { message: "That role could not be found." };

      await Role.updateOne(
        { _id: id },
        {
          $set: {
            name: parsed.data.name,
            description: parsed.data.description || null,
            permissions: finalPermissions,
            updatedBy: admin.id,
          },
        }
      );

      const added = finalPermissions.filter((entry) => !existing.permissions.includes(entry));
      const removed = existing.permissions.filter((entry) => !finalPermissions.includes(entry));

      await recordAudit({
        actor: admin,
        action: "role.permissions.update",
        entityType: "Role",
        entityId: id,
        entityLabel: parsed.data.name,
        before: { permissions: existing.permissions.length },
        after: { permissions: finalPermissions.length },
        metadata: { added, removed },
      });
    } else {
      const slug = parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);

      const clash = await Role.findOne({ slug }).select("_id").lean();
      if (clash) return { errors: { name: ["A role with that name already exists."] } };

      const created = await Role.create({
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        permissions: finalPermissions,
        system: false,
        createdBy: admin.id,
      });

      await recordAudit({
        actor: admin,
        action: "role.create",
        entityType: "Role",
        entityId: created._id.toString(),
        entityLabel: created.name,
        after: { permissions: finalPermissions.length },
      });
    }
  } catch (err) {
    console.error("[admin] could not save the role:", err);
    return { message: GENERIC_FAILURE };
  }

  revalidatePath("/admin/roles");
  redirect("/admin/roles?saved=1");
}

/** Deletes a custom role. Seeded roles are protected. */
export async function deleteRoleAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const admin = await requirePermission("admin.manage_roles", "/admin/roles");
  if (!mongoose.Types.ObjectId.isValid(id)) return;

  try {
    await connectDB();
    const role = await Role.findById(id).select("name system").lean();
    if (!role || role.system) return;

    // Deleting a role that people hold would leave them with no permissions at
    // all and no way to tell why — `getCurrentAdmin` would simply refuse them.
    const holders = await AdminUser.countDocuments({ roleId: id });
    if (holders > 0) return;

    await Role.deleteOne({ _id: id });

    await recordAudit({
      actor: admin,
      action: "role.delete",
      entityType: "Role",
      entityId: id,
      entityLabel: role.name,
    });
  } catch (err) {
    console.error("[admin] could not delete the role:", err);
  }

  revalidatePath("/admin/roles");
}

/** Updates one platform setting. */
export async function updateSettingAction(formData: FormData): Promise<void> {
  const key = text(formData, "key");
  const raw = text(formData, "value");
  const admin = await requirePermission("system.configure", "/admin/settings");

  try {
    await connectDB();
    const setting = await Setting.findOne({ key });
    if (!setting) return;

    let value: unknown = raw;
    if (setting.valueType === "number") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      value = parsed;
    } else if (setting.valueType === "boolean") {
      value = formData.get("value") === "on" || raw === "true";
    } else if (setting.valueType === "json") {
      try {
        value = JSON.parse(raw);
      } catch {
        return;
      }
    }

    const before = setting.value;
    setting.value = value;
    setting.updatedBy = new mongoose.Types.ObjectId(admin.id);
    setting.updatedByName = admin.name;
    await setting.save();

    await recordAudit({
      actor: admin,
      action: "system.settings.update",
      entityType: "Setting",
      entityId: setting._id.toString(),
      entityLabel: setting.label,
      before: { [key]: before },
      after: { [key]: value },
    });
  } catch (err) {
    console.error("[admin] could not update the setting:", err);
  }

  revalidatePath("/admin/settings");
}

/** Turns a feature flag on, off, to beta or to a percentage rollout. */
export async function updateFlagAction(formData: FormData): Promise<void> {
  const key = text(formData, "key");
  const state = text(formData, "state");
  const percentage = Number(text(formData, "rolloutPercentage") || 0);
  const admin = await requirePermission("system.manage_flags", "/admin/system/flags");

  if (!["enabled", "disabled", "beta", "rollout"].includes(state)) return;

  try {
    await connectDB();
    const flag = await FeatureFlag.findOne({ key });
    if (!flag) return;

    const before = { state: flag.state, rolloutPercentage: flag.rolloutPercentage };

    flag.state = state as typeof flag.state;
    if (state === "rollout") {
      flag.rolloutPercentage = Math.min(100, Math.max(0, Math.round(percentage)));
    }
    flag.updatedBy = new mongoose.Types.ObjectId(admin.id);
    flag.updatedByName = admin.name;
    await flag.save();

    await recordAudit({
      actor: admin,
      action: "system.flag.update",
      entityType: "FeatureFlag",
      entityId: flag._id.toString(),
      entityLabel: flag.name,
      before,
      after: { state: flag.state, rolloutPercentage: flag.rolloutPercentage },
    });
  } catch (err) {
    console.error("[admin] could not update the feature flag:", err);
  }

  revalidatePath("/admin/system/flags");
}

/**
 * Resets an administrator's password to a freshly generated one.
 *
 * Returned to the inviter to pass on out of band, rather than emailed: the
 * admin mail path is not built, and inventing one that silently does nothing
 * would be worse than handing over a string.
 */
export async function resetAdminPasswordAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const admin = await requirePermission("admin.edit", "/admin/team");
  if (!mongoose.Types.ObjectId.isValid(id)) return;

  try {
    await connectDB();
    const target = await AdminUser.findById(id).select("name").lean();
    if (!target) return;

    const password = randomBytes(9).toString("base64url");
    await AdminUser.updateOne(
      { _id: id },
      {
        $set: {
          passwordHash: await bcrypt.hash(password, 12),
          failedLoginCount: 0,
          lockedUntil: null,
          status: "active",
        },
      }
    );

    await recordAudit({
      actor: admin,
      action: "admin.password.reset",
      entityType: "AdminUser",
      entityId: id,
      entityLabel: target.name,
    });

    // Surfaced through the redirect rather than the audit log, which must never
    // hold a credential.
    redirect(`/admin/team/${id}?password=${encodeURIComponent(password)}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[admin] could not reset the password:", err);
  }
}

/** Every permission string, for the role editor. */
export async function allPermissions(): Promise<string[]> {
  return ALL_PERMISSIONS;
}

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
