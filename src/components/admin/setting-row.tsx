"use client";

import { useState } from "react";
import { BUTTON_STYLES } from "@/components/admin/ui";
import { updateSettingAction } from "@/lib/admin/actions/administration";

/**
 * One editable setting.
 *
 * Read-only until the operator clicks Edit. A page of thirty live inputs is a
 * page where a stray keystroke changes the session timeout, and settings are
 * changed rarely enough that one extra click is the right trade.
 */
export function SettingRow({
  settingKey,
  label,
  description,
  value,
  valueType,
  editable,
  updatedBy,
  updatedAt,
}: {
  settingKey: string;
  label: string;
  description: string | null;
  value: string | number | boolean | null;
  valueType: string;
  editable: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  const isBoolean = valueType === "boolean";

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">{label}</p>
          {description && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{settingKey}</p>
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[13px] font-medium tabular-nums text-slate-700 dark:text-slate-200">
              {isBoolean ? (value ? "On" : "Off") : String(value ?? "—")}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md px-2 py-1 text-[12px] font-medium text-blue-600 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-400 dark:hover:bg-blue-500/10"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <form action={updateSettingAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="key" value={settingKey} />

          {isBoolean ? (
            <label className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                name="value"
                defaultChecked={value === true}
                className="h-[15px] w-[15px] rounded border-slate-300 dark:border-slate-600"
              />
              Enabled
            </label>
          ) : (
            <input
              name="value"
              type={valueType === "number" ? "number" : "text"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          )}

          <button type="submit" className={BUTTON_STYLES.primary}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(value === null ? "" : String(value));
            }}
            className={BUTTON_STYLES.secondary}
          >
            Cancel
          </button>
        </form>
      )}

      {updatedBy && updatedAt && !editing && (
        <p className="mt-1 text-[11px] text-slate-400">
          Last changed by {updatedBy} {updatedAt}
        </p>
      )}
    </div>
  );
}
