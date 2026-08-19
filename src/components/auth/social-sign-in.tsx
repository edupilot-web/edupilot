"use client";

import { useState } from "react";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "@/components/icons";

const PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "microsoft", label: "Microsoft", Icon: MicrosoftIcon },
  { id: "apple", label: "Apple", Icon: AppleIcon },
] as const;

/**
 * The three social buttons from the design.
 *
 * There is no OAuth backend yet — EduPilot has no client IDs, redirect URIs or
 * provider callbacks — so rather than pretend, each button explains that and
 * points the user back at email and password. Wiring one up later means
 * replacing `setUnavailable` with a link to that provider's authorize URL.
 */
export function SocialSignIn({ label }: { label: string }) {
  const [unavailable, setUnavailable] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-[13px] text-slate-400 dark:bg-slate-950 dark:text-slate-500">
            {label}
          </span>
        </div>
      </div>

      {unavailable && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          {unavailable} sign-in is not connected yet. Please use your email and password.
        </p>
      )}

      {PROVIDERS.map(({ id, label: name, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setUnavailable(name)}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white py-2.5 text-[14px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {name}
        </button>
      ))}
    </div>
  );
}
