"use client";

import { useState } from "react";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "@/components/icons";

const BUTTON =
  "flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white py-2.5 text-[14px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

/**
 * The three social buttons from the design.
 *
 * Google is wired to the real OAuth flow (`/api/auth/google/start`). Microsoft
 * and Apple have no client credentials or callbacks, so rather than pretend,
 * they say so and point the user back at email and password.
 */
export function SocialSignIn({ label, next }: { label: string; next?: string }) {
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const googleHref = next
    ? `/api/auth/google/start?next=${encodeURIComponent(next)}`
    : "/api/auth/google/start";

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

      {/* A full navigation, not a client-side one: this leaves the app for Google. */}
      <a href={googleHref} className={BUTTON}>
        <GoogleIcon className="h-[18px] w-[18px] shrink-0" />
        Continue with Google
      </a>

      <button type="button" onClick={() => setUnavailable("Microsoft")} className={BUTTON}>
        <MicrosoftIcon className="h-[18px] w-[18px] shrink-0" />
        Microsoft
      </button>

      <button type="button" onClick={() => setUnavailable("Apple")} className={BUTTON}>
        <AppleIcon className="h-[18px] w-[18px] shrink-0" />
        Apple
      </button>
    </div>
  );
}
