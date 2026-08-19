"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand";
import {
  BellIcon,
  ChevronDownIcon,
  CloseIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
} from "@/components/icons";
import { logoutAction } from "@/lib/auth-actions";

type NavItem = {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
};

/**
 * The marketing navigation from the design. Only Home exists today — the rest
 * are the intended information architecture and 404 until those pages land.
 */
const NAV: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Explore",
    href: "/explore",
    children: [
      { label: "Courses", href: "/explore/courses" },
      { label: "Programs", href: "/explore/programs" },
      { label: "Research areas", href: "/explore/research" },
    ],
  },
  { label: "Resources", href: "/resources" },
  { label: "Scholarships", href: "/scholarships" },
  { label: "Mentorship", href: "/mentorship" },
  { label: "Community", href: "/community" },
  { label: "Events", href: "/events" },
];

export type HeaderUser = {
  name: string;
  /** Unread notification count shown on the bell. */
  notifications?: number;
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

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const exploreRef = useDismiss<HTMLDivElement>(exploreOpen, () => setExploreOpen(false));
  const accountRef = useDismiss<HTMLDivElement>(accountOpen, () => setAccountOpen(false));

  // Navigating should never leave a panel hanging open. Done on click rather
  // than in an effect keyed to the pathname, which would cascade renders.
  const closeAll = () => {
    setMenuOpen(false);
    setExploreOpen(false);
    setAccountOpen(false);
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-slate-800 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-3 px-5 lg:h-[92px] lg:px-10">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className={`${ICON_BUTTON} lg:hidden`}
        >
          {menuOpen ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>

        <BrandLogo size="lg" className="mr-auto lg:mr-0" />

        {/* Desktop navigation */}
        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 lg:flex">
          {NAV.map((item) =>
            item.children ? (
              <div key={item.label} ref={exploreRef} className="relative">
                <button
                  type="button"
                  onClick={() => setExploreOpen((v) => !v)}
                  aria-expanded={exploreOpen}
                  className={`flex items-center gap-1 rounded-lg px-3.5 py-2 text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${
                    isActive(item.href)
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform ${exploreOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {exploreOpen && (
                  <div className="absolute left-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={closeAll}
                        className="block px-4 py-2 text-[14px] text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`relative rounded-lg px-3.5 py-2 text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${
                  isActive(item.href)
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {item.label}
                {isActive(item.href) && (
                  <span
                    aria-hidden="true"
                    // Sits flush with the header's bottom edge: the 92px bar
                    // centres a ~38px nav item, leaving 27px below it.
                    className="absolute -bottom-[27px] left-3.5 right-3.5 h-[3px] rounded-full bg-blue-600"
                  />
                )}
              </Link>
            )
          )}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-1.5 lg:gap-2">
          <button type="button" aria-label="Search" className={ICON_BUTTON}>
            <SearchIcon className="h-[22px] w-[22px]" />
          </button>

          {user && (
            <button type="button" aria-label="Notifications" className={`relative ${ICON_BUTTON}`}>
              <BellIcon className="h-[22px] w-[22px]" />
              {!!user.notifications && (
                <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                  {user.notifications}
                </span>
              )}
            </button>
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

          <Link
            href="/signup"
            className="ml-1 hidden rounded-xl bg-blue-600 px-6 py-3 text-[15px] font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 lg:block"
          >
            Join Now
          </Link>
        </div>
      </div>

      {/* Mobile navigation */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="border-t border-slate-200 bg-white px-5 pb-6 pt-3 lg:hidden dark:border-slate-800 dark:bg-slate-900"
        >
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV.map((item) => (
              <div key={item.label}>
                <Link
                  href={item.href}
                  onClick={closeAll}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-3 text-[16px] font-medium transition ${
                    isActive(item.href)
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </Link>
                {item.children?.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={closeAll}
                    className="block rounded-lg px-6 py-2.5 text-[15px] text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            {user ? (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-[15px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  <LogOutIcon className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                onClick={closeAll}
                className="rounded-xl border border-slate-200 px-5 py-3 text-center text-[15px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                Sign in
              </Link>
            )}
            <Link
              href="/signup"
              onClick={closeAll}
              className="rounded-xl bg-blue-600 px-5 py-3 text-center text-[15px] font-semibold text-white shadow-sm shadow-blue-600/30"
            >
              Join Now
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
