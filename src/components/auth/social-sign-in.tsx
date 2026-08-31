import { GoogleIcon } from "@/components/icons";

const BUTTON =
  "flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white py-2.5 text-[14px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

/**
 * Social sign-in: Google only.
 *
 * Microsoft and Apple buttons were here and are gone. They had no client
 * credentials and no callback route, so they could only ever say "not connected
 * yet" — and a button that exists to explain that it does not work costs a
 * reader more than its absence does. Every provider offered here is one that
 * actually completes a sign-in.
 *
 * No client state remains, so this is plain markup with no directive. It is
 * still compiled into the client bundle, because both callers — the login and
 * signup forms — are client components; what has gone is the state and the
 * handlers, not the module.
 */
export function SocialSignIn({ label, next }: { label: string; next?: string }) {
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

      {/* A full navigation, not a client-side one: this leaves the app for Google. */}
      <a href={googleHref} className={BUTTON}>
        <GoogleIcon className="h-[18px] w-[18px] shrink-0" />
        Continue with Google
      </a>
    </div>
  );
}
