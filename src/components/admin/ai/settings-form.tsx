"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_STYLES } from "@/components/admin/ui";
import {
  AI_CONTENT_LENGTHS,
  AI_CONTENT_LENGTH_LABELS,
  AI_CONTENT_LEVELS,
  AI_CONTENT_LEVEL_LABELS,
  AI_DIFFICULTIES,
  AI_DIFFICULTY_LABELS,
  AI_LANGUAGES,
  AI_LANGUAGE_LABELS,
} from "@/lib/admin/ai/fields";

/**
 * The editable half of one provider's settings (spec §24).
 *
 * Sends only the fields that changed. A PATCH carrying every field would
 * overwrite a value another administrator changed a moment earlier, and the
 * settings screen is exactly where two people are most likely to be at once
 * during a rollout.
 *
 * There is no field for an API key, by design. The server rejects any
 * credential-shaped key in `configuration` (§22), so offering an input would be
 * offering something that cannot work.
 */

type Provider = {
  id: string;
  providerType: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  implemented: boolean;
  configured: boolean;
  temperature: number;
  maxTokens: number;
  topP: number;
  defaultLanguage: string;
  defaultDifficulty: string;
  defaultLength: string;
  defaultLevel: string;
  enableContentValidation: boolean;
  enableHallucinationChecks: boolean;
  requireAdminReview: boolean;
  preventAutomaticPublishing: boolean;
};

export function SettingsForm({ provider, canManage }: { provider: Provider; canManage: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(provider);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  /** Only what differs from what the server last sent. */
  const changes = () => {
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(draft) as (keyof Provider)[]) {
      if (key === "id" || key === "providerType" || key === "implemented" || key === "configured") continue;
      if (draft[key] !== provider[key]) patch[key] = draft[key];
    }
    return patch;
  };

  const dirty = Object.keys(changes()).length > 0;

  const save = async () => {
    const patch = changes();
    if (!Object.keys(patch).length) return;

    setBusy(true);
    setMessage(null);

    const response = await fetch("/api/admin/ai/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: provider.id, ...patch }),
    });

    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setMessage({ tone: "error", text: payload?.error?.message ?? "The settings could not be saved." });
      // Roll the form back to the server's state: a rejected change left in the
      // inputs looks saved.
      setDraft(provider);
      return;
    }

    setMessage({ tone: "ok", text: "Saved." });
    router.refresh();
  };

  const set = <K extends keyof Provider>(key: K, value: Provider[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const disabled = !canManage || busy;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">Model</span>
          <input
            value={draft.model}
            onChange={(event) => set("model", event.target.value)}
            disabled={disabled || !provider.implemented}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <Number label="Temperature" value={draft.temperature} min={0} max={2} step={0.05} disabled={disabled} onChange={(value) => set("temperature", value)} />
        <Number label="Max tokens" value={draft.maxTokens} min={256} max={200000} step={256} disabled={disabled} onChange={(value) => set("maxTokens", value)} />
        <Number label="Top P" value={draft.topP} min={0} max={1} step={0.05} disabled={disabled} onChange={(value) => set("topP", value)} />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
          Content defaults
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Choice label="Language" value={draft.defaultLanguage} options={AI_LANGUAGES} labels={AI_LANGUAGE_LABELS} disabled={disabled} onChange={(value) => set("defaultLanguage", value)} />
          <Choice label="Difficulty" value={draft.defaultDifficulty} options={AI_DIFFICULTIES} labels={AI_DIFFICULTY_LABELS} disabled={disabled} onChange={(value) => set("defaultDifficulty", value)} />
          <Choice label="Length" value={draft.defaultLength} options={AI_CONTENT_LENGTHS} labels={AI_CONTENT_LENGTH_LABELS} disabled={disabled} onChange={(value) => set("defaultLength", value)} />
          <Choice label="Level" value={draft.defaultLevel} options={AI_CONTENT_LEVELS} labels={AI_CONTENT_LEVEL_LABELS} disabled={disabled} onChange={(value) => set("defaultLevel", value)} />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
          Safety
        </p>
        <div className="space-y-2">
          <Toggle
            label="Content validation"
            hint="Run the grounding, endorsement and consistency checks after generation."
            checked={draft.enableContentValidation}
            disabled={disabled}
            onChange={(value) => set("enableContentValidation", value)}
          />
          <Toggle
            label="Hallucination checks"
            hint="Flag citations, page numbers and standards that are not in the subject's reference list."
            checked={draft.enableHallucinationChecks}
            disabled={disabled}
            onChange={(value) => set("enableHallucinationChecks", value)}
          />
          <Toggle
            label="Require admin review"
            hint="Keep the review step in front of approval."
            checked={draft.requireAdminReview}
            disabled={disabled}
            onChange={(value) => set("requireAdminReview", value)}
          />
          <Toggle
            label="Prevent automatic publishing"
            hint="Always on in effect: nothing in the generation pipeline can publish. This switch only removes the extra confirmation."
            checked={draft.preventAutomaticPublishing}
            disabled={disabled}
            onChange={(value) => set("preventAutomaticPublishing", value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {provider.implemented && (
          <>
            <Toggle
              label="Enabled"
              checked={draft.enabled}
              disabled={disabled || (!provider.configured && !draft.enabled)}
              onChange={(value) => set("enabled", value)}
              hint={
                !provider.configured
                  ? "Cannot be enabled until its credentials are present in the server environment."
                  : undefined
              }
            />
            {!draft.isDefault && provider.configured && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => set("isDefault", true)}
                className={BUTTON_STYLES.secondary}
              >
                Make default
              </button>
            )}
          </>
        )}

        {canManage && (
          <button type="button" onClick={save} disabled={!dirty || busy} className={`${BUTTON_STYLES.primary} disabled:opacity-50`}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}

        {!canManage && (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            You have read-only access to AI settings.
          </p>
        )}

        {message && (
          <p
            className={`text-[12px] ${
              message.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

function Number({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = globalThis.Number(event.target.value);
          if (globalThis.Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] tabular-nums disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  );
}

function Choice({
  label,
  value,
  options,
  labels,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  labels: Record<string, string>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/40 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
      />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-slate-800 dark:text-slate-100">{label}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}
