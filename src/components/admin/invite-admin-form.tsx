"use client";

import { useActionState, useState } from "react";
import { BUTTON_STYLES, Card, ErrorState } from "@/components/admin/ui";
import { inviteAdminAction } from "@/lib/admin/actions/administration";

/**
 * Invite form (spec §28).
 *
 * The chosen role's description and permission count are shown as soon as it is
 * selected. Handing someone administrative access without seeing what that
 * covers is how a Support Admin ends up able to delete colleges.
 */
export function InviteAdminForm({
  roles,
}: {
  roles: { id: string; name: string; description: string | null; permissionCount: number }[];
}) {
  const [state, formAction, pending] = useActionState(inviteAdminAction, undefined);
  const [roleId, setRoleId] = useState("");

  const selected = roles.find((role) => role.id === roleId);

  return (
    <Card title="Invite an administrator" description="They appear as Invited until they set a password.">
      <form action={formAction} className="space-y-3">
        {state?.message && <ErrorState title="Could not invite" detail={state.message} />}

        <Field label="Full name" name="name" errors={state?.errors?.name} required />
        <Field
          label="Work email"
          name="email"
          type="email"
          errors={state?.errors?.email}
          required
        />

        <div>
          <label
            htmlFor="invite-role"
            className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
          >
            Role<span className="ml-0.5 text-rose-500">*</span>
          </label>
          <select
            id="invite-role"
            name="roleId"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Choose a role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {state?.errors?.roleId && (
            <p className="mt-1 text-[11.5px] font-medium text-rose-600 dark:text-rose-400">
              {state.errors.roleId[0]}
            </p>
          )}
        </div>

        {selected && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
              {selected.description ?? "No description recorded for this role."}
            </p>
            <p className="mt-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              {selected.permissionCount === -1
                ? "Unrestricted access to everything, including administrator management."
                : `${selected.permissionCount} permissions`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Team" name="team" errors={state?.errors?.team} />
          <Field label="Job title" name="title" errors={state?.errors?.title} />
        </div>

        <button type="submit" disabled={pending} className={`${BUTTON_STYLES.primary} w-full`}>
          {pending ? "Inviting…" : "Send invitation"}
        </button>
      </form>
    </Card>
  );
}

function Field({
  label,
  name,
  type = "text",
  errors,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  errors?: string[];
  required?: boolean;
}) {
  const invalid = Boolean(errors?.length);
  return (
    <div>
      <label
        htmlFor={`invite-${name}`}
        className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      <input
        id={`invite-${name}`}
        name={name}
        type={type}
        aria-invalid={invalid || undefined}
        className={`w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition dark:bg-slate-950 dark:text-white ${
          invalid
            ? "border-rose-300 focus:border-rose-500 dark:border-rose-500/60"
            : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700"
        }`}
      />
      {invalid && (
        <p className="mt-1 text-[11.5px] font-medium text-rose-600 dark:text-rose-400">
          {errors![0]}
        </p>
      )}
    </div>
  );
}
