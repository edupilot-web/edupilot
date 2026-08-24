"use client";

import { useState } from "react";
import { Badge, BUTTON_STYLES } from "@/components/admin/ui";
import { updateFlagAction } from "@/lib/admin/actions/administration";

const STATES = [
  { value: "enabled", label: "On", tone: "success" as const },
  { value: "rollout", label: "Rollout", tone: "info" as const },
  { value: "beta", label: "Beta", tone: "purple" as const },
  { value: "disabled", label: "Off", tone: "neutral" as const },
];

/**
 * One feature flag.
 *
 * The percentage field only appears in the `rollout` state. A slider that is
 * present but inert whenever the flag is simply on or off is a control that
 * teaches people to ignore it.
 */
export function FlagRow({
  flagKey,
  name,
  description,
  state,
  rolloutPercentage,
  enabledForRoles,
  editable,
  updatedBy,
  updatedAt,
}: {
  flagKey: string;
  name: string;
  description: string | null;
  state: string;
  rolloutPercentage: number;
  enabledForRoles: string[];
  editable: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}) {
  const [draftState, setDraftState] = useState(state);
  const [percentage, setPercentage] = useState(rolloutPercentage);

  const current = STATES.find((entry) => entry.value === state) ?? STATES[3];
  const dirty = draftState !== state || (draftState === "rollout" && percentage !== rolloutPercentage);

  return (
    <form action={updateFlagAction} className="px-4 py-3">
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="state" value={draftState} />
      {draftState === "rollout" && (
        <input type="hidden" name="rolloutPercentage" value={percentage} />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium text-slate-800 dark:text-slate-100">
              {name}
            </span>
            <Badge tone={current.tone}>
              {current.label}
              {state === "rollout" ? ` ${rolloutPercentage}%` : ""}
            </Badge>
          </div>
          {description && (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{flagKey}</p>
          {enabledForRoles.length > 0 && (
            <p className="mt-1 text-[11.5px] text-slate-400">
              Always on for: {enabledForRoles.join(", ")}
            </p>
          )}
        </div>

        {editable && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
              {STATES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setDraftState(entry.value)}
                  aria-pressed={draftState === entry.value}
                  className={`px-2.5 py-1 text-[12px] font-medium transition ${
                    draftState === entry.value
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {draftState === "rollout" && (
              <label className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={percentage}
                  onChange={(event) => setPercentage(Number(event.target.value))}
                  className="w-32"
                  aria-label={`${name} rollout percentage`}
                />
                <span className="w-9 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">
                  {percentage}%
                </span>
              </label>
            )}

            {dirty && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftState(state);
                    setPercentage(rolloutPercentage);
                  }}
                  className={BUTTON_STYLES.secondary}
                >
                  Reset
                </button>
                <button type="submit" className={BUTTON_STYLES.primary}>
                  Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {updatedBy && updatedAt && !dirty && (
        <p className="mt-1 text-[11px] text-slate-400">
          Last changed by {updatedBy} {updatedAt}
        </p>
      )}
    </form>
  );
}
