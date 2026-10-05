"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { ChevronDownIcon, ChevronLeftIcon, CloseIcon } from "@/components/icons";
import { ADMIN_SECTION_ICONS } from "@/components/admin/icons";
import { ADMIN_NAV, type AdminNavSection } from "@/lib/admin/nav";
import { hasAnyPermission } from "@/lib/admin/permissions";

/**
 * The admin navigation rail.
 *
 * Two levels, one open at a time. The rail lists the nine sections and nothing
 * else until one is opened; opening a section closes the previous one. Forty-odd
 * destinations laid out flat is a wall nobody reads, and an operator is only ever
 * working inside one of them.
 *
 * A section heading is a disclosure, not a link. There is no landing page behind
 * "Institution Management" — clicking it reveals where you can actually go, so
 * making it navigate somewhere would mean inventing a destination.
 *
 * Collapses to a 60px icon strip on demand, because the rail is 232px of a
 * laptop's 1280 and a college table wants every one of them. The collapsed flag
 * is owned by `AdminShell` rather than by this component: the content column has
 * to shift by the same amount, and one owner is better than two states kept in
 * step through a CSS `:has()` selector.
 *
 * Sections an admin has no permission for are removed, not disabled. A menu
 * full of links that answer 403 teaches people to distrust the menu.
 */
export function AdminSidebar({
  permissions,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: {
  permissions: string[];
  /** Mobile drawer state, owned by the shell. */
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();

  const sections = ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasAnyPermission(permissions, item.permissions)),
  })).filter((section) => section.items.length > 0);

  const activeKey = activeSectionKey(sections, pathname);
  const activeHref = activeItemHref(sections, pathname);

  /**
   * Which section is open is *derived*, not synchronised.
   *
   * The default is the section holding the current page — landing on a page with
   * its section shut would hide the entry for the very screen being looked at.
   * A click overrides that, but only for as long as the route stands still: the
   * override records the path it was made on, so any navigation retires it and
   * the new page's section opens on its own. That keeps one source of truth and
   * needs no effect to copy the route into state.
   */
  const [override, setOverride] = useState<{ key: string | null; path: string } | null>(null);
  const openKey = override && override.path === pathname ? override.key : activeKey;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Admin navigation"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-[transform,width] duration-200 lg:z-30 lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-[60px]" : "w-[232px]"}`}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
          <Link
            href="/admin"
            className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            <BrandMark className="h-6 w-6 shrink-0" />
            {!collapsed && (
              <span className="truncate text-[14px] font-semibold tracking-tight text-slate-900 dark:text-white">
                EduPilot
                <span className="ml-1.5 rounded bg-slate-100 px-1 py-px text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-700/70 dark:text-slate-300">
                  Admin
                </span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 lg:hidden dark:hover:bg-white/10 dark:hover:text-white"
          >
            <CloseIcon className="h-4.5 w-4.5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {sections.map((section) => (
            <Section
              key={section.key}
              section={section}
              activeHref={activeHref}
              collapsed={collapsed}
              expanded={openKey === section.key}
              holdsCurrentPage={activeKey === section.key}
              onToggle={() => {
                // The icon strip has nowhere to show children, so the click that
                // opens a section there also widens the rail.
                if (collapsed) {
                  setOverride({ key: section.key, path: pathname });
                  onToggleCollapsed();
                  return;
                }
                setOverride({
                  key: openKey === section.key ? null : section.key,
                  path: pathname,
                });
              }}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="hidden h-9 shrink-0 items-center gap-2 border-t border-slate-200 px-3.5 text-[12px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 lg:flex dark:border-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-300"
        >
          <ChevronLeftIcon className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && "Collapse"}
        </button>
      </aside>
    </>
  );
}

/**
 * The section whose item best matches the current path.
 *
 * Longest match wins, mirroring `navItemForPath`: `/admin/colleges/123` belongs
 * to Institution Management, not to the Dashboard section whose Overview href is
 * a prefix of every admin path. Querystring entries ("Pending Verification")
 * still resolve their section, because only the path is compared.
 */
function activeSectionKey(sections: AdminNavSection[], pathname: string): string | null {
  let bestKey: string | null = null;
  let bestLength = -1;

  for (const section of sections) {
    for (const item of section.items) {
      const href = item.href.split("?")[0];
      if (itemMatches(item, href, pathname) && href.length > bestLength) {
        bestKey = section.key;
        bestLength = href.length;
      }
    }
  }

  return bestKey;
}

/**
 * The single entry the current path belongs to.
 *
 * Longest match wins, because `matchPrefix` entries overlap their own children:
 * “Teachers” matches every `/admin/teachers/*` path, so on
 * `/admin/teachers/access` both it and “Teacher access” would otherwise be
 * highlighted at once, and `aria-current="page"` would be on two links.
 *
 * `activeSectionKey` has always resolved its own ambiguity this way. This is
 * the same rule applied one level down, so a section and the item inside it
 * cannot disagree about where the user is.
 */
function activeItemHref(sections: AdminNavSection[], pathname: string): string | null {
  let best: string | null = null;

  for (const section of sections) {
    for (const item of section.items) {
      const href = item.href.split("?")[0];
      if (!itemMatches(item, href, pathname)) continue;
      if (best === null || href.length > best.length) best = href;
    }
  }

  return best;
}

function itemMatches(
  item: { matchPrefix?: boolean },
  href: string,
  pathname: string
): boolean {
  return href === pathname || (item.matchPrefix === true && pathname.startsWith(`${href}/`));
}

function Section({
  section,
  activeHref,
  collapsed,
  expanded,
  holdsCurrentPage,
  onToggle,
  onNavigate,
}: {
  section: AdminNavSection;
  /** Resolved once for the whole rail, so only one entry can be current. */
  activeHref: string | null;
  collapsed: boolean;
  expanded: boolean;
  /** The current page lives in here — worth marking even while shut. */
  holdsCurrentPage: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const Icon = ADMIN_SECTION_ICONS[section.icon];
  const panelId = `admin-nav-${section.key}`;

  if (collapsed) {
    return (
      <div className="mb-0.5">
        <button
          type="button"
          onClick={onToggle}
          title={section.heading}
          aria-label={section.heading}
          aria-expanded={expanded}
          className={`flex w-full items-center justify-center rounded-md py-2 transition outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
            holdsCurrentPage
              ? "bg-blue-50 text-blue-700 dark:bg-slate-700/60 dark:text-white"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
          }`}
        >
          {Icon && <Icon className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[12.5px] transition outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-white/5 ${
          holdsCurrentPage
            ? "font-medium text-slate-900 dark:text-white"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
        }`}
      >
        {Icon && (
          <Icon
            className={`h-4 w-4 shrink-0 ${
              holdsCurrentPage
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-400 dark:text-slate-500"
            }`}
          />
        )}
        <span className="truncate text-left">{section.heading}</span>
        {/*
          A dot stands in for the open chevron when a shut section holds the
          current page, so "where am I" survives closing it.
        */}
        {holdsCurrentPage && !expanded && (
          <span
            aria-hidden="true"
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400"
          />
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${
            holdsCurrentPage && !expanded ? "ml-1" : "ml-auto"
          } ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <ul id={panelId} className="mb-1.5 mt-0.5 space-y-px">
          {section.items.map((item) => {
            const href = item.href.split("?")[0];
            // A querystring entry ("Pending Verification") is active only on an
            // exact match, or every one of them would light up on the base path.
            const active = item.href.includes("?") ? false : href === activeHref;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-2.5 rounded-md py-[5px] pl-[34px] pr-2.5 text-[12.5px] transition outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    active
                      ? "bg-blue-50 font-medium text-blue-700 dark:bg-slate-700/60 dark:text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute -left-2 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-blue-600 dark:bg-blue-400"
                    />
                  )}
                  <span className="truncate">{item.label}</span>
                  {/*
                    A dot marks a destination whose screen is not written yet,
                    so nobody is surprised by the placeholder behind it.
                  */}
                  {!item.built && (
                    <span
                      title="Not built yet"
                      className="ml-auto h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
