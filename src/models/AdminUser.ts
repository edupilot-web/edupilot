import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * An administrator.
 *
 * A separate collection from `User`, not a `role: "admin"` flag on it. Three
 * reasons, in order of weight:
 *
 * 1. **Blast radius.** A student session must never be one field away from
 *    admin access. Separate collections mean separate cookies and separate
 *    verification paths, so a bug in the student session code cannot grant
 *    anything here.
 * 2. Admin accounts carry things students do not — a role, granular permission
 *    overrides, a team, 2FA, invitation state, login history.
 * 3. The same human may hold both, and conflating them would force one password
 *    policy and one session lifetime on two very different risk profiles.
 */
const adminUserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * Null until the invitation is accepted — an invited admin exists, and
     * appears in the list as "Invited", before it has a password.
     */
    passwordHash: { type: String, select: false, default: null },

    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    /** Denormalised so the admin list renders the role without a join per row. */
    roleName: { type: String, default: null, maxlength: 80 },

    /**
     * Per-account additions and removals on top of the role.
     *
     * Kept because roles are shared: granting one person `student.view_pii`
     * should not hand it to everyone else with the same role. `denied` wins
     * over `extra` and over the role, so a revocation cannot be undone by a
     * role edit somewhere else.
     */
    extraPermissions: { type: [String], default: [] },
    deniedPermissions: { type: [String], default: [] },

    /** Free-text grouping — "Institution Data", "Support", "Growth". */
    team: { type: String, default: null, trim: true, maxlength: 80 },
    title: { type: String, default: null, trim: true, maxlength: 120 },
    avatarUrl: { type: String, default: null },
    phone: { type: String, default: null, trim: true, maxlength: 24 },

    status: {
      type: String,
      enum: ["invited", "active", "suspended", "deactivated"],
      default: "invited",
      index: true,
    },

    /** SHA-256 of the invitation token. Same reasoning as email verification. */
    inviteTokenHash: { type: String, default: null, select: false },
    inviteExpiresAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    invitedAt: { type: Date, default: null },

    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: null, select: false },

    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null, maxlength: 64 },
    /**
     * Consecutive failures since the last success. Cleared on sign-in and used
     * to lock the account; a login-attempt history lives in `AdminLoginEvent`.
     */
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

adminUserSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.inviteTokenHash;
    delete ret.twoFactorSecret;
    delete ret.__v;
    return ret;
  },
});

adminUserSchema.index({ status: 1, name: 1 });

export type AdminUserDoc = InferSchemaType<typeof adminUserSchema>;

resetModelInDev("AdminUser");

export const AdminUser: Model<AdminUserDoc> =
  (mongoose.models.AdminUser as Model<AdminUserDoc>) ||
  mongoose.model<AdminUserDoc>("AdminUser", adminUserSchema);

/**
 * Every sign-in attempt, successful or not (spec §43).
 *
 * Its own collection rather than an array on the admin, because it grows
 * without bound and is queried by time across all admins ("failed logins in the
 * last hour") far more often than per account.
 */
const adminLoginEventSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
    /** Recorded even when no account matched, so probing shows up in the log. */
    email: { type: String, required: true, lowercase: true, maxlength: 200 },
    outcome: {
      type: String,
      enum: ["success", "bad-password", "unknown-account", "locked", "inactive", "logout"],
      required: true,
      index: true,
    },
    ip: { type: String, default: null, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 400 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/**
 * One index on `createdAt`, carrying the TTL.
 *
 * Not three. A field-level `index: true` plus a `{ createdAt: -1 }` sort index
 * plus this one asks mongod for two indexes on the same key and then conflicts
 * on the options — and the descending one buys nothing, because an ascending
 * index is traversed in reverse just as cheaply.
 *
 * Security logs are evidence for a while and clutter forever. 180 days is long
 * enough to investigate an incident and short enough that the collection does
 * not become the largest thing in the database.
 */
adminLoginEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export type AdminLoginEventDoc = InferSchemaType<typeof adminLoginEventSchema>;

resetModelInDev("AdminLoginEvent");

export const AdminLoginEvent: Model<AdminLoginEventDoc> =
  (mongoose.models.AdminLoginEvent as Model<AdminLoginEventDoc>) ||
  mongoose.model<AdminLoginEventDoc>("AdminLoginEvent", adminLoginEventSchema);
