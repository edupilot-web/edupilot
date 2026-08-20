"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellIcon, ChevronDownIcon, LogOutIcon, MenuIcon, SearchIcon, SettingsIcon, UserIcon } from "@/components/icons";
import { logoutAction } from "@/lib/auth-actions";

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function AppTopbar({
  name,
  unread,
  onOpenNav,
  onUnavailable,
}: {
  name: string;
  unread: number;
  onOpenNav: () => void;
  /** Called by the controls that have no backend yet, so the shell can say so. */
  onUnavailable: (what: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstName = name.trim().split(/\s+/)[0];

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-200/70 bg-[#f7f9fc]/90 px-4 backdrop-blur sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950/90">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 lg:hidden dark:hover:bg-slate-800"
      >
        <MenuIcon className="h-[22px] w-[22px]" />
      </button>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onUnavailable("Search");
        }}
        className="relative min-w-0 flex-1 sm:max-w-[420px]"
      >
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          name="q"
          placeholder="Search for courses, jobs, people..."
          aria-label="Search"
          className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-[14px] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </form>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          onClick={() => onUnavailable("Notifications")}
          aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
          className="relative grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:hover:bg-slate-800"
        >
          <BellIcon className="h-[21px] w-[21px]" />
          {unread > 0 && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#f7f9fc] dark:ring-slate-950" />
          )}
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 sm:pr-2.5 dark:hover:bg-slate-800"
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[13px] font-semibold text-white"
            >
              {initials(name)}
            </span>
            <span className="hidden text-[14.5px] font-semibold text-slate-700 sm:inline dark:text-slate-200">
              Hi, {firstName}
            </span>
            <ChevronDownIcon className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="truncate px-4 pb-1.5 pt-1 text-[12.5px] text-slate-400">{name}</p>
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-[14px] text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
              >
                <UserIcon className="h-4 w-4" />
                My Profile
              </Link>
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-[14px] text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
              >
                <SettingsIcon className="h-4 w-4" />
                Settings
              </Link>
              <form action={logoutAction} className="border-t border-slate-100 pt-1 dark:border-slate-700">
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[14px] text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
                >
                  <LogOutIcon className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
