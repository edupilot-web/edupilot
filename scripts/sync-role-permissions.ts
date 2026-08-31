/**
 * Grants a system role the permissions its preset gained since it was seeded.
 *
 * Roles are *data*: the nine presets in `lib/admin/permissions.ts` are written to
 * the `roles` collection once, and are editable afterwards. So adding a
 * permission module to the presets — as the AI course content module did — has no
 * effect on a database that was already seeded. Super Admin keeps working because
 * it holds the `*` wildcard; every other role silently lacks the new module.
 *
 * **Additive, and only for modules the role has nothing for.** If a role already
 * holds any permission in a module, it is left completely alone: an operator may
 * have deliberately removed `student.view_pii` from Support Admin, and a sync
 * that "restored" it from the preset would quietly undo a security decision. A
 * module the role has *no* permissions for cannot be a curated state — it is a
 * module that did not exist when the role was written.
 *
 * Never removes anything, and never touches a custom (non-system) role.
 *
 * Run with:  npm run sync:role-permissions
 *            npm run sync:role-permissions -- --dry-run
 *            npm run sync:role-permissions -- --module ai_course_content,ai_settings
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { Role } from "../src/models/Role";
import { ROLE_PRESETS, SUPER_ADMIN_PERMISSION } from "../src/lib/admin/permissions";

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function readArg(name: string): string | null {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : null;
}

/** The module half of a permission string: `ai_course_content.view` → `ai_course_content`. */
function moduleOf(permission: string): string {
  return permission.split(".")[0];
}

async function main(): Promise<void> {
  const dryRun = hasFlag("dry-run");
  const only = readArg("module")?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? null;

  await connectDB();

  let changed = 0;
  let untouched = 0;

  for (const preset of ROLE_PRESETS) {
    const role = await Role.findOne({ slug: preset.slug }).select("slug name permissions system").lean();

    if (!role) {
      console.log(`  ${preset.slug.padEnd(20)} not in the database, skipped`);
      continue;
    }

    if (!role.system) {
      console.log(`  ${role.slug.padEnd(20)} custom role, left alone`);
      continue;
    }

    const current = role.permissions ?? [];

    // The wildcard already covers everything, now and in future.
    if (current.includes(SUPER_ADMIN_PERMISSION)) {
      console.log(`  ${role.slug.padEnd(20)} holds "*", nothing to add`);
      untouched += 1;
      continue;
    }

    const held = new Set(current);
    const modulesHeld = new Set(current.map(moduleOf));

    const toAdd = preset.permissions.filter((permission) => {
      if (held.has(permission)) return false;
      // The safety rule: only ever fill in a module the role has nothing for.
      if (modulesHeld.has(moduleOf(permission))) return false;
      if (only && !only.includes(moduleOf(permission))) return false;
      return true;
    });

    if (!toAdd.length) {
      untouched += 1;
      continue;
    }

    console.log(`  ${role.slug.padEnd(20)} + ${toAdd.join(", ")}`);

    if (!dryRun) {
      // `$addToSet` with `$each` rather than a computed array: two operators
      // running this at once must not have one overwrite the other's result.
      await Role.updateOne({ _id: role._id }, { $addToSet: { permissions: { $each: toAdd } } });
    }
    changed += 1;
  }

  console.log("");
  console.log(dryRun ? "DRY RUN — nothing was written." : `roles updated: ${changed}`);
  console.log(`roles already current: ${untouched}`);

  if (changed && !dryRun) {
    console.log("");
    console.log("Signed-in administrators pick this up on their next request —");
    console.log("permissions are resolved per request, not stored in the session cookie.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
