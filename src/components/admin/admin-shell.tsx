"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { LogOutIcon, MenuIcon } from "@/components/icons";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { CommandPalette } from "@/components/admin/command-palette";
import {
  getServerSnapshot,
  getSnapshot,
  setCollapsed,
  subscribe,
} from "@/components/admin/sidebar-state";
import { initials } from "@/lib/admin/format";

/**
 * Chrome for every signed-in admin screen: rail, top bar, content column.
 *
 * A client component only because the mobile drawer, the collapse toggle and
 * the palette need state. The page itself arrives as `children` and stays a
 * Server Component — the shell hydrates, the content does not.
 */
export function AdminShell({
  admin,
  logoutAction,
  children,
}: {
  admin: {
    name: string;
    email: string;
    roleName: string;
    permissions: string[];
    avatarUrl: string | null;
  };
  /** Passed from the server layout so the menu can post to it. */
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * The collapse preference lives in `localStorage`, read through
   * `useSyncExternalStore` — see `sidebar-state.ts`. It is per browser rather
   * than per account: it is about the screen in front of the operator, not
   * about who they are.
   */
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="min-h-screen bg-[#f7f8fa] dark:bg-slate-950">
      <AdminSidebar
        permissions={admin.permissions}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
      />

      {/* The rail is fixed, so the content column carries the offset itself. */}
      <div
        className={`transition-[padding] duration-200 ${
          collapsed ? "lg:pl-[60px]" : "lg:pl-[232px]"
        }`}
      >
        <header className="sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 lg:hidden dark:hover:bg-slate-800"
          >
            <MenuIcon className="h-4.5 w-4.5" />
          </button>

          <div className="flex-1">
            <CommandPalette permissions={admin.permissions} />
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-slate-800"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-[11px] font-semibold text-white dark:bg-slate-700">
                {initials(admin.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-[12.5px] font-medium leading-tight text-slate-800 dark:text-slate-100">
                  {admin.name}
                </span>
                <span className="block text-[11px] leading-tight text-slate-400">
                  {admin.roleName}
                </span>
              </span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+6px)] z-20 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                    <p className="truncate text-[12.5px] font-medium text-slate-800 dark:text-slate-100">
                      {admin.name}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-400">{admin.email}</p>
                  </div>
                  <Link
                    href="/admin/security"
                    onClick={() => setMenuOpen(false)}
                    role="menuitem"
                    className="block px-3 py-1.5 text-[12.5px] text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Security & sessions
                  </Link>
                  <Link
                    href="/dashboard"
                    role="menuitem"
                    className="block px-3 py-1.5 text-[12.5px] text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Student app
                  </Link>
                  <form action={logoutAction} className="border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      <LogOutIcon className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
