/**
 * Creates (or resets) a single administrator account.
 *
 * Deliberately *not* part of `seed:admin`, which clears and rebuilds the whole
 * admin dataset. This touches exactly two documents — the role it needs and the
 * administrator itself — so it is safe to run against a database that already
 * has real data in it.
 *
 * Idempotent: running it twice leaves the same account, with the password reset
 * to the one given and any lockout cleared. An existing role of the same slug is
 * reused as-is and never rewritten, because an operator may have edited its
 * permissions on purpose.
 *
 * Run with:  npm run create-admin
 *            npm run create-admin -- --email ops@edupilot.dev --name "Ops Lead"
 *            npm run create-admin -- --password 'S0me:Other:Pass' --role platform-admin
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { AdminUser } from "../src/models/AdminUser";
import { Role } from "../src/models/Role";
import { ROLE_PRESETS } from "../src/lib/admin/permissions";

const DEFAULTS = {
  email: "admin@edupilot.dev",
  name: "EduPilot Admin",
  password: "Admin@2026",
  role: "super-admin",
  team: "Platform",
  title: "Administrator",
};

/** Minimal `--key value` parsing. No dependency worth adding for six flags. */
function readArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`--${key} needs a value`);
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

async function main(): Promise<void> {
  const args = readArgs();
  const email = (args.email ?? DEFAULTS.email).trim().toLowerCase();
  const name = args.name ?? DEFAULTS.name;
  const password = args.password ?? DEFAULTS.password;
  const roleSlug = (args.role ?? DEFAULTS.role).trim().toLowerCase();
  const team = args.team ?? DEFAULTS.team;
  const title = args.title ?? DEFAULTS.title;

  const preset = ROLE_PRESETS.find((entry) => entry.slug === roleSlug);

  await connectDB();

  // Reuse an existing role untouched; only fall back to the preset to create a
  // missing one. A slug that is neither present nor a preset is an error rather
  // than an empty-permission role that would sign in and then see nothing.
  let role = await Role.findOne({ slug: roleSlug });
  if (!role) {
    if (!preset) {
      const known = ROLE_PRESETS.map((entry) => entry.slug).join(", ");
      throw new Error(`No role "${roleSlug}" in the database, and no preset by that name. Known presets: ${known}`);
    }
    role = await Role.create({
      name: preset.name,
      slug: preset.slug,
      description: preset.description,
      permissions: preset.permissions,
      system: preset.system,
      adminCount: 0,
    });
    console.log(`created role  ${role.slug} (${role.permissions.length} permissions)`);
  } else {
    console.log(`using role    ${role.slug} (${role.permissions.length} permissions)`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await AdminUser.findOne({ email }).select("_id roleId");

  if (existing) {
    await AdminUser.updateOne(
      { _id: existing._id },
      {
        $set: {
          name,
          passwordHash,
          roleId: role._id,
          roleName: role.name,
          team,
          title,
          status: "active",
          // A reset is also the way out of a lockout, so clear both counters.
          failedLoginCount: 0,
          lockedUntil: null,
          inviteTokenHash: null,
          inviteExpiresAt: null,
          deactivatedAt: null,
          deactivatedBy: null,
        },
      }
    );
    // Keep the roles table honest if this moved the account between roles.
    if (existing.roleId && existing.roleId.toString() !== role._id.toString()) {
      await Role.updateOne({ _id: existing.roleId }, { $inc: { adminCount: -1 } });
      await Role.updateOne({ _id: role._id }, { $inc: { adminCount: 1 } });
    }
    console.log(`updated admin ${email} (password reset, status active)`);
  } else {
    await AdminUser.create({
      name,
      email,
      passwordHash,
      roleId: role._id,
      roleName: role.name,
      team,
      title,
      status: "active",
      twoFactorEnabled: false,
      failedLoginCount: 0,
    });
    await Role.updateOne({ _id: role._id }, { $inc: { adminCount: 1 } });
    console.log(`created admin ${email}`);
  }

  console.log("");
  console.log("  sign in at  /admin/login");
  console.log(`  email       ${email}`);
  console.log(`  password    ${password}`);
  console.log(`  role        ${role.name}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
