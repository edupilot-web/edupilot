import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { AdminLoginEvent, AdminUser } from "@/models/AdminUser";
import { Role } from "@/models/Role";
import { AuditLog } from "@/models/AuditLog";
import {
  containsRegex,
  readDateRange,
  readList,
  readPagination,
  readParam,
  type SearchParams,
} from "@/lib/admin/query";

// ── Administrators ─────────────────────────────────────────────────────────

export async function listAdmins(params: SearchParams) {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  const filter: Record<string, unknown> = {};
  const query = readParam(params, "q")?.trim();
  if (query) {
    const term = containsRegex(query);
    filter.$or = [{ name: term }, { email: term }, { team: term }];
  }
  const status = readList(params, "status");
  if (status.length) filter.status = { $in: status };
  const roles = readList(params, "role").filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (roles.length) filter.roleId = { $in: roles.map((id) => new mongoose.Types.ObjectId(id)) };

  const [docs, total] = await Promise.all([
    AdminUser.find(filter)
      .select("name email roleId roleName team title status lastLoginAt createdAt twoFactorEnabled extraPermissions deniedPermissions")
      .sort({ status: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AdminUser.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      email: doc.email,
      roleId: String(doc.roleId),
      roleName: doc.roleName ?? "—",
      team: doc.team ?? null,
      title: doc.title ?? null,
      status: doc.status,
      lastLoginAt: doc.lastLoginAt ?? null,
      createdAt: doc.createdAt,
      twoFactorEnabled: doc.twoFactorEnabled === true,
      overrides: (doc.extraPermissions?.length ?? 0) + (doc.deniedPermissions?.length ?? 0),
    })),
  };
}

export async function getAdminDetail(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  await connectDB();

  const admin = await AdminUser.findById(id).lean();
  if (!admin) return null;

  const [role, recentActions, logins] = await Promise.all([
    Role.findById(admin.roleId).select("name slug description permissions").lean(),
    AuditLog.find({ actorId: admin._id })
      .select("action entityType entityLabel createdAt severity")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    AdminLoginEvent.find({ adminId: admin._id })
      .select("outcome ip userAgent createdAt")
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
  ]);

  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    team: admin.team ?? null,
    title: admin.title ?? null,
    status: admin.status,
    twoFactorEnabled: admin.twoFactorEnabled === true,
    lastLoginAt: admin.lastLoginAt ?? null,
    lastLoginIp: admin.lastLoginIp ?? null,
    createdAt: admin.createdAt,
    invitedAt: admin.invitedAt ?? null,
    deactivatedAt: admin.deactivatedAt ?? null,
    extraPermissions: admin.extraPermissions ?? [],
    deniedPermissions: admin.deniedPermissions ?? [],
    role: role
      ? {
          id: String(role._id),
          name: role.name,
          slug: role.slug,
          description: role.description ?? null,
          permissions: role.permissions,
        }
      : null,
    recentActions: recentActions.map((row) => ({
      id: String(row._id),
      action: row.action,
      entityType: row.entityType,
      entityLabel: row.entityLabel ?? null,
      at: row.createdAt,
      severity: row.severity ?? "info",
    })),
    logins: logins.map((row) => ({
      id: String(row._id),
      outcome: row.outcome,
      ip: row.ip ?? null,
      userAgent: row.userAgent ?? null,
      at: row.createdAt,
    })),
  };
}

// ── Roles ──────────────────────────────────────────────────────────────────

export async function listRoles() {
  await connectDB();
  const roles = await Role.find({}).sort({ system: -1, name: 1 }).lean();

  // Counted live rather than trusted from `adminCount`: the roles screen is
  // where a wrong number would be noticed, and there are never many roles.
  const counts = await AdminUser.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $group: { _id: "$roleId", count: { $sum: 1 } } },
  ]);
  const byRole = new Map(counts.map((row) => [String(row._id), row.count]));

  return roles.map((role) => ({
    id: String(role._id),
    name: role.name,
    slug: role.slug,
    description: role.description ?? null,
    permissions: role.permissions,
    system: role.system === true,
    adminCount: byRole.get(String(role._id)) ?? 0,
  }));
}

export async function getRole(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  await connectDB();

  const role = await Role.findById(id).lean();
  if (!role) return null;

  const admins = await AdminUser.find({ roleId: role._id })
    .select("name email status")
    .sort({ name: 1 })
    .lean();

  return {
    id: String(role._id),
    name: role.name,
    slug: role.slug,
    description: role.description ?? null,
    permissions: role.permissions,
    system: role.system === true,
    admins: admins.map((admin) => ({
      id: String(admin._id),
      name: admin.name,
      email: admin.email,
      status: admin.status,
    })),
  };
}

// ── Audit ──────────────────────────────────────────────────────────────────

export const AUDIT_FILTER_KEYS = ["actor", "action", "entityType", "severity", "created"] as const;

export async function listAuditLog(params: SearchParams) {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  const filter: Record<string, unknown> = {};

  const query = readParam(params, "q")?.trim();
  if (query) {
    const term = containsRegex(query);
    filter.$or = [{ entityLabel: term }, { actorName: term }, { action: term }];
  }

  const actors = readList(params, "actor").filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (actors.length) filter.actorId = { $in: actors.map((id) => new mongoose.Types.ObjectId(id)) };

  const actions = readList(params, "action");
  if (actions.length) filter.action = { $in: actions };

  const entityTypes = readList(params, "entityType");
  if (entityTypes.length) filter.entityType = { $in: entityTypes };

  const severity = readList(params, "severity");
  if (severity.length) filter.severity = { $in: severity };

  const entityId = readParam(params, "entityId");
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    filter.entityId = new mongoose.Types.ObjectId(entityId);
  }

  const created = readDateRange(params, "created");
  if (created) filter.createdAt = created;

  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      actorName: doc.actorName ?? (doc.actorType === "system" ? "System" : "Unknown"),
      actorEmail: doc.actorEmail ?? null,
      actorRole: doc.actorRole ?? null,
      actorType: doc.actorType,
      action: doc.action,
      entityType: doc.entityType,
      entityId: doc.entityId ? String(doc.entityId) : null,
      entityLabel: doc.entityLabel ?? null,
      before: (doc.before ?? null) as Record<string, unknown> | null,
      after: (doc.after ?? null) as Record<string, unknown> | null,
      metadata: (doc.metadata ?? null) as Record<string, unknown> | null,
      batchId: doc.batchId ?? null,
      severity: doc.severity ?? "info",
      ip: doc.ip ?? null,
      at: doc.createdAt,
    })),
  };
}

/** Distinct actors and actions, for the audit filter chips. */
export async function getAuditFacets() {
  await connectDB();

  const [actions, entityTypes, actors] = await Promise.all([
    AuditLog.distinct("action"),
    AuditLog.distinct("entityType"),
    AdminUser.find({}).select("name").sort({ name: 1 }).limit(20).lean(),
  ]);

  return {
    actions: (actions as string[]).sort(),
    entityTypes: (entityTypes as string[]).sort(),
    actors: actors.map((admin) => ({ id: String(admin._id), name: admin.name })),
  };
}

// ── Security ───────────────────────────────────────────────────────────────

export async function getSecurityOverview() {
  await connectDB();

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [recent, failedToday, lockedAccounts, without2fa, activeAdmins] = await Promise.all([
    AdminLoginEvent.find({})
      .select("email outcome ip userAgent createdAt adminId")
      .sort({ createdAt: -1 })
      .limit(60)
      .lean(),
    AdminLoginEvent.countDocuments({
      createdAt: { $gte: dayAgo },
      outcome: { $in: ["bad-password", "unknown-account", "locked"] },
    }),
    AdminUser.countDocuments({ lockedUntil: { $gt: new Date() } }),
    AdminUser.countDocuments({ status: "active", twoFactorEnabled: false }),
    AdminUser.countDocuments({ status: "active" }),
  ]);

  /**
   * Addresses with repeated failures and no matching account — the shape of a
   * credential-stuffing attempt rather than someone mistyping their password.
   */
  const suspicious = new Map<string, { ip: string; attempts: number; emails: Set<string> }>();
  for (const event of recent) {
    if (event.outcome !== "unknown-account" && event.outcome !== "bad-password") continue;
    const ip = event.ip ?? "unknown";
    const entry = suspicious.get(ip) ?? { ip, attempts: 0, emails: new Set<string>() };
    entry.attempts += 1;
    entry.emails.add(event.email);
    suspicious.set(ip, entry);
  }

  return {
    failedToday,
    lockedAccounts,
    without2fa,
    activeAdmins,
    events: recent.map((event) => ({
      id: String(event._id),
      email: event.email,
      outcome: event.outcome,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      at: event.createdAt,
    })),
    suspicious: [...suspicious.values()]
      .filter((entry) => entry.attempts >= 3)
      .map((entry) => ({
        ip: entry.ip,
        attempts: entry.attempts,
        addresses: entry.emails.size,
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 5),
  };
}
