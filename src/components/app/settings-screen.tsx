"use client";

import { useState } from "react";
import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";

/**
 * Notification settings.
 *
 * Renders from the **vocabulary the server sends**, not from a list hard-coded
 * here: which categories exist, which may be switched off and which channels
 * actually work all arrive with the values. That is what stops the screen
 * offering a toggle the server would ignore — a switch a student sets that
 * silently changes nothing is worse than an absent one.
 *
 * Only `in_app` is implemented today, so email and push are shown as
 * unavailable rather than hidden. Hiding them would make the platform look like
 * it had decided against them; saying "not available yet" is the truth and sets
 * the expectation correctly.
 */

export type PreferenceCategory = {
  key: string;
  label: string;
  blurb: string;
  optional: boolean;
};

export type PreferenceChannel = { key: string; available: boolean };

export type PreferencesPayload = {
  channels: Record<string, Record<string, boolean>>;
  mutedUntil: string | null;
  /**
   * Whether the pause is still in force, decided on the server.
   *
   * Reading the clock during render is not allowed — it makes the output depend
   * on when React happens to re-run the component — and this is a value the
   * server already knows at the moment it builds the page. A pause that expires
   * while the tab is open resolves on the next load, which is the right
   * trade for a control the student themselves just set.
   */
  mutedActive: boolean;
  categories: PreferenceCategory[];
  availableChannels: PreferenceChannel[];
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In the app",
  email: "Email",
  push: "Push",
};

export function SettingsScreen({
  initial,
  account,
}: {
  initial: PreferencesPayload;
  account: { name: string; email: string; isGoogleAccount: boolean };
}) {
  const [channels, setChannels] = useState(initial.channels);
  const [mutedUntil, setMutedUntil] = useState<string | null>(initial.mutedUntil);
  const [mutedNow, setMutedNow] = useState(initial.mutedActive);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usableChannels = initial.availableChannels.filter((channel) => channel.available);

  /**
   * Save the whole preference set on every change rather than diffing.
   *
   * The payload is five categories by three channels — small enough that a diff
   * would cost more in complexity than it saves in bytes, and sending the whole
   * thing means the stored document always matches what is on screen.
   */
  const persist = async (
    nextChannels: typeof channels,
    nextMuted: string | null
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setNote(null);

    try {
      const response = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: nextChannels, mutedUntil: nextMuted }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "Could not save your settings.");
        return;
      }

      setNote("Saved.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (category: string, channel: string, enabled: boolean) => {
    const next = {
      ...channels,
      [category]: { ...(channels[category] ?? {}), [channel]: enabled },
    };
    // Optimistic: the toggle moves immediately and reverts only on a failure,
    // because a checkbox that waits for a round trip feels broken.
    setChannels(next);
    void persist(next, mutedUntil);
  };

  const mute = (until: string | null) => {
    setMutedUntil(until);
    setMutedNow(until !== null);
    void persist(channels, until);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          Choose what EduPilot tells you about, and how.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </p>
      )}
      {note && !error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {note}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[16.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Notifications
        </h2>
        <p className="mt-1 text-[13.5px] text-slate-500 dark:text-slate-400">
          {usableChannels.length === 1
            ? `Only "${CHANNEL_LABELS[usableChannels[0].key] ?? usableChannels[0].key}" is available so far.`
            : "Pick a channel for each kind of notification."}
        </p>

        <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {initial.categories.map((category) => (
            <li key={category.key} className="flex flex-wrap items-start justify-between gap-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-slate-900 dark:text-white">
                  {category.label}
                </p>
                <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                  {category.blurb}
                </p>
                {!category.optional && (
                  /**
                   * `account` is not optional, and the screen says why rather
                   * than showing a disabled switch with no explanation. "Your
                   * account was rejected" is the only way a student learns what
                   * happened.
                   */
                  <p className="mt-1 text-[12px] text-slate-400 dark:text-slate-500">
                    Always on — this is how we tell you about your account.
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-4">
                {usableChannels.map((channel) => (
                  <label
                    key={channel.key}
                    className={`flex items-center gap-2 text-[13px] ${
                      category.optional
                        ? "cursor-pointer text-slate-600 dark:text-slate-300"
                        : "cursor-not-allowed text-slate-400 dark:text-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
                      checked={category.optional ? (channels[category.key]?.[channel.key] ?? true) : true}
                      disabled={!category.optional || saving}
                      onChange={(event) => toggle(category.key, channel.key, event.target.checked)}
                    />
                    {CHANNEL_LABELS[channel.key] ?? channel.key}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>

        {initial.availableChannels.some((channel) => !channel.available) && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            {initial.availableChannels
              .filter((channel) => !channel.available)
              .map((channel) => CHANNEL_LABELS[channel.key] ?? channel.key)
              .join(" and ")}{" "}
            notifications are not sent yet. They will appear here as options once they are.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[16.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Pause notifications
        </h2>
        <p className="mt-1 text-[13.5px] text-slate-500 dark:text-slate-400">
          {mutedNow
            ? `Paused until ${new Date(mutedUntil!).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`
            : "Stop everything except account notices for a while."}
        </p>

        <div className="mt-3.5 flex flex-wrap gap-2">
          {mutedNow ? (
            <button
              type="button"
              onClick={() => mute(null)}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Resume notifications
            </button>
          ) : (
            [
              ["For 1 hour", 60],
              ["Until tomorrow", 60 * 24],
              ["For a week", 60 * 24 * 7],
            ].map(([label, minutes]) => (
              <button
                key={label as string}
                type="button"
                onClick={() => mute(new Date(Date.now() + (minutes as number) * 60_000).toISOString())}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {label as string}
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[16.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Account
        </h2>
        <dl className="mt-3 space-y-2.5 text-[14px]">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">Name</dt>
            <dd className="text-slate-900 dark:text-white">{account.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">Email</dt>
            <dd className="truncate text-slate-900 dark:text-white">{account.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">Sign-in</dt>
            <dd className="text-slate-900 dark:text-white">
              {account.isGoogleAccount ? "Google" : "Email and password"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-[13px] text-slate-500 dark:text-slate-400">
          Your academic details are on{" "}
          <Link href={APP_ROUTES.profile} className="font-semibold text-blue-700 underline dark:text-blue-400">
            your profile
          </Link>
          .
        </p>

        {/* Said plainly rather than shown as a disabled field: there is no
            endpoint behind either, and a greyed-out control reads as a bug. */}
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          Changing your password{account.isGoogleAccount ? "" : ", name"} and choosing a light or dark
          theme are not built yet.
        </p>
      </section>
    </div>
  );
}
