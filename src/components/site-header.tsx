"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand";
import { AudienceSwitch, type Audience } from "@/components/landing-sections";
import {
  BellIcon,
  ChevronDownIcon,
  LogOutIcon,
} from "@/components/icons";
import { logoutAction } from "@/lib/auth-actions";

/**
 * The header carries the **audience switch** rather than a nav.
 *
 * There are no marketing sub-pages to link to, and the previous version
 * invented six that were all 404s. What a visitor actually needs to choose here
 * is which half of the product they are: the page then shows that half and
 * nothing else, so nobody scrolls past content addressed to somebody else.
 */

export type HeaderUser = {
  name: string;
  /**
   * Unread notifications, from the real service.
   *
   * Required rather than optional: the previous version defaulted to a
   * hard-coded 3 when nobody supplied one, which is how a fake number survives
   * a year of code review. A caller that does not know the count has to say
   * `0`, which is at least honest.
   */
  notifications: number;
};

/** Closes a popover on outside click and on Escape. */
function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return ref;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** "Ada Lovelace" -> "Ada L." — the abbreviated form used in the design. */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

function Avatar({ name, className = "h-10 w-10" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[13px] font-semibold text-white ring-2 ring-white dark:ring-slate-900`}
    >
      {initials(name)}
    </span>
  );
}

const ICON_BUTTON =
  "grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white";

export function SiteHeader({
  user,
  audience,
}: {
  user: HeaderUser | null;
  audience: Audience;
}) {
  const [accountOpen, setAccountOpen] = useState(false);

  const accountRef = useDismiss<HTMLDivElement>(accountOpen, () => setAccountOpen(false));

  // Navigating should never leave a panel hanging open. Done on click rather
  // than in an effect keyed to the pathname, which would cascade renders.
  const closeAll = () => setAccountOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-slate-800 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-3 px-5 lg:h-[92px] lg:px-10">
        <BrandLogo size="lg" className="mr-auto lg:mr-0" />

        {/* Desktop navigation */}
        <div className="mx-auto hidden lg:block">
          <AudienceSwitch audience={audience} />
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-1.5 lg:gap-2">
          {user && (
            /**
             * A link, and a real count.
             *
             * This was a `<button>` with no handler showing a hard-coded 3 — a
             * badge that told every signed-in visitor they had three of
             * something, and did nothing when pressed. The count now comes from
             * the notification service and the control goes where it says.
             */
            <Link
              href="/notifications"
              aria-label={
                user.notifications
                  ? `Notifications, ${user.notifications} unread`
                  : "Notifications"
              }
              className={`relative ${ICON_BUTTON}`}
            >
              <BellIcon className="h-[22px] w-[22px]" />
              {user.notifications > 0 && (
                <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                  {user.notifications > 9 ? "9+" : user.notifications}
                </span>
              )}
            </Link>
          )}

          {user ? (
            <>
              <span
                aria-hidden="true"
                className="mx-1 hidden h-7 w-px bg-slate-200 lg:block dark:bg-slate-700"
              />
              <div ref={accountRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAccountOpen((v) => !v)}
                  aria-expanded={accountOpen}
                  className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 lg:pr-2.5 dark:hover:bg-slate-800"
                >
                  <Avatar name={user.name} />
                  <span className="hidden text-[15px] font-semibold text-slate-700 lg:inline dark:text-slate-200">
                    {shortName(user.name)}
                  </span>
                  <ChevronDownIcon className="hidden h-4 w-4 text-slate-400 lg:block" />
                </button>

                {accountOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
                    <p className="truncate px-4 pb-1.5 pt-1 text-[13px] text-slate-400">
                      {user.name}
                    </p>
                    <Link
                      href="/dashboard"
                      onClick={closeAll}
                      className="block px-4 py-2 text-[14px] text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
                    >
                      Dashboard
                    </Link>
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
                      >
                        <LogOutIcon className="h-4 w-4" />
                        Sign out
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="hidden rounded-lg px-3.5 py-2 text-[15px] font-medium text-slate-600 transition hover:text-slate-900 lg:block dark:text-slate-300 dark:hover:text-white"
            >
              Sign in
            </Link>
          )}

          {/* "Join Now" was shown to people who had already joined and were
              signed in at the time. Somebody who is signed in wants one thing
              from this page, which is to get back into the app. */}
          <Link
            href={user ? "/dashboard" : "/signup"}
            className="ml-1 hidden rounded-xl bg-blue-600 px-6 py-3 text-[15px] font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 lg:block"
          >
            {user ? "Go to dashboard" : "Get started"}
          </Link>
        </div>
      </div>

    </header>
  );
}
