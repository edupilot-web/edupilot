"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BUTTON_STYLES, Card, ErrorState, InfoNote } from "@/components/admin/ui";
import { saveRoleAction } from "@/lib/admin/actions/administration";
import { PERMISSION_MODULES } from "@/lib/admin/permissions";

/**
 * Create or edit a role (spec §27).
 *
 * Permissions are grouped by module with a select-all per group, because the
 * realistic edit is "give this role everything about colleges" rather than
 * seven individual ticks. Every checkbox still stands alone, so the narrow case
 * is possible too.
 */
export function RoleEditor({
  role,
  canGrantWildcard,
}: {
  role: {
    id?: string;
    name: string;
    description: string;
    permissions: string[];
    system: boolean;
  };
  /** Only a Super Admin may create another one. */
  canGrantWildcard: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveRoleAction, undefined);

  const [selected, setSelected] = useState(new Set(role.permissions.filter((p) => p !== "*")));
  const [wildcard, setWildcard] = useState(role.permissions.includes("*"));

  function toggle(permission: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  function toggleModule(moduleKey: string, permissions: string[]) {
    const allOn = permissions.every((permission) => selected.has(permission));
    setSelected((current) => {
      const next = new Set(current);
      for (const permission of permissions) {
        if (allOn) next.delete(permission);
        else next.add(permission);
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      {role.id && <input type="hidden" name="id" value={role.id} />}
      {[...selected].map((permission) => (
        <input key={permission} type="hidden" name="permissions" value={permission} />
      ))}

      {state?.message && <ErrorState title="Could not save the role" detail={state.message} />}

      <Card title="Role">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="role-name"
              className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
            >
              Name<span className="ml-0.5 text-rose-500">*</span>
            </label>
            <input
              id="role-name"
              name="name"
              defaultValue={role.name}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            {state?.errors?.name && (
              <p className="mt-1 text-[11.5px] font-medium text-rose-600 dark:text-rose-400">
                {state.errors.name[0]}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="role-description"
              className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
            >
              Description
            </label>
            <input
              id="role-description"
              name="description"
              defaultValue={role.description}
              placeholder="What this role is for, in one line."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        {canGrantWildcard && (
          <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5 dark:border-rose-500/30 dark:bg-rose-500/5">
            <input
              type="checkbox"
              name="wildcard"
              checked={wildcard}
              onChange={(event) => setWildcard(event.target.checked)}
              className="mt-0.5 h-[15px] w-[15px] rounded border-slate-300 dark:border-slate-600"
            />
            <span className="text-[13px] text-slate-800 dark:text-slate-100">
              Unrestricted access
              <span className="mt-0.5 block text-[12px] text-slate-500 dark:text-slate-400">
                Everything, including inviting administrators and editing roles — and it keeps pace
                with modules added later. Only give this to people who should be able to do
                anything.
              </span>
            </span>
          </label>
        )}
      </Card>

      {!wildcard &&
        PERMISSION_MODULES.map((entry) => {
          const permissions = entry.actions.map((action) => `${entry.key}.${action.key}`);
          const onCount = permissions.filter((permission) => selected.has(permission)).length;

          return (
            <Card
              key={entry.key}
              title={entry.label}
              description={entry.blurb}
              actions={
                <button
                  type="button"
                  onClick={() => toggleModule(entry.key, permissions)}
                  className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {onCount === permissions.length ? "Clear all" : "Select all"}
                </button>
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {entry.actions.map((action) => {
                  const permission = `${entry.key}.${action.key}`;
                  return (
                    <label
                      key={permission}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(permission)}
                        onChange={() => toggle(permission)}
                        className="mt-0.5 h-[15px] w-[15px] rounded border-slate-300 dark:border-slate-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">
                          {action.label}
                        </span>
                        <span className="block text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                          {action.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Card>
          );
        })}

      {wildcard && (
        <InfoNote>
          Unrestricted roles have no permission list — they match everything, including modules that
          do not exist yet. Untick the box above to choose permissions individually.
        </InfoNote>
      )}

      <div className="flex items-center justify-between gap-3 pb-6">
        <span className="text-[12.5px] text-slate-500 dark:text-slate-400">
          {wildcard ? "Unrestricted" : `${selected.size} permissions selected`}
        </span>
        <div className="flex gap-2">
          <Link href="/admin/roles" className={BUTTON_STYLES.secondary}>
            Cancel
          </Link>
          <button type="submit" disabled={pending} className={BUTTON_STYLES.primary}>
            {pending ? "Saving…" : role.id ? "Save role" : "Create role"}
          </button>
        </div>
      </div>
    </form>
  );
}
