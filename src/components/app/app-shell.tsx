"use client";

import { useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { AlertIcon, CloseIcon } from "@/components/icons";

/**
 * Chrome for every signed-in page: the navigation rail, the top bar, and one
 * shared notice slot.
 *
 * Several controls in the design — search, notifications, Upgrade to Pro — have
 * no backend behind them. Rather than let them look broken or pretend to work,
 * they route through `notice` and say so plainly.
 */
export function AppShell({
  name,
  unread,
  children,
}: {
  name: string;
  unread: number;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#f7f9fc] dark:bg-slate-950">
      <AppSidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onUpgrade={() => setNotice("Upgrade to Pro")}
      />

      <div className="flex min-h-screen flex-col lg:pl-[264px]">
        <AppTopbar
          name={name}
          unread={unread}
          onOpenNav={() => setNavOpen(true)}
          onUnavailable={setNotice}
        />

        {notice && (
          <div className="px-4 pt-4 sm:px-6 lg:px-8">
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <AlertIcon className="mt-px h-[18px] w-[18px] shrink-0" />
              <p className="flex-1">
                <span className="font-semibold">{notice}</span> is not connected yet — this part of
                EduPilot has no backend behind it so far.
              </p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg transition hover:bg-amber-100 dark:hover:bg-amber-500/20"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
