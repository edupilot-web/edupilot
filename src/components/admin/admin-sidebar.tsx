"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { ChevronLeftIcon, CloseIcon } from "@/components/icons";
import { ADMIN_SECTION_ICONS } from "@/components/admin/icons";
import { ADMIN_NAV, type AdminNavSection } from "@/lib/admin/nav";
import { hasAnyPermission } from "@/lib/admin/permissions";

/**
 * The admin navigation rail.
 *
 * Collapses to icons on demand, because the sidebar is 232px of a laptop's 1280
 * and a college table wants every one of them. The collapsed flag is owned by
 * `AdminShell` rather than by this component: the content column has to shift
 * by the same amount, and one owner is better than two states kept in step
 * through a CSS `:has()` selector.
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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800 bg-[#0b1220] transition-[transform,width] duration-200 lg:z-30 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-[60px]" : "w-[232px]"}`}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-800 px-3">
          <Link
            href="/admin"
            className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
          >
            <BrandMark className="h-6 w-6 shrink-0" />
            {!collapsed && (
              <span className="truncate text-[14px] font-semibold tracking-tight text-white">
                EduPilot
                <span className="ml-1.5 rounded bg-slate-700/70 px-1 py-px text-[9.5px] font-bold uppercase tracking-wider text-slate-300">
                  Admin
                </span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <CloseIcon className="h-4.5 w-4.5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {sections.map((section) => (
            <Section
              key={section.key}
              section={section}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="hidden h-9 shrink-0 items-center gap-2 border-t border-slate-800 px-3.5 text-[12px] font-medium text-slate-500 transition hover:bg-white/5 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/50 lg:flex"
        >
          <ChevronLeftIcon className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && "Collapse"}
        </button>
      </aside>
    </>
  );
}

function Section({
  section,
  pathname,
  collapsed,
  onNavigate,
}: {
  section: AdminNavSection;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = ADMIN_SECTION_ICONS[section.icon];

  return (
    <div className="mb-1">
      {collapsed ? (
        <div className="flex justify-center py-1.5" title={section.heading}>
          {Icon && <Icon className="h-4 w-4 text-slate-600" />}
        </div>
      ) : (
        <p className="px-2.5 pb-1 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {section.heading}
        </p>
      )}

      <ul className="space-y-px">
        {section.items.map((item) => {
          const href = item.href.split("?")[0];
          // A querystring entry ("Pending Verification") is active only on an
          // exact match, or every one of them would light up on the base path.
          const active = item.href.includes("?")
            ? false
            : href === pathname || (item.matchPrefix && pathname.startsWith(`${href}/`));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-[5px] text-[12.5px] transition outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-slate-700/60 font-medium text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                {collapsed ? (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active ? "bg-blue-400" : "bg-slate-600"}`}
                  />
                ) : (
                  <>
                    <span className="truncate">{item.label}</span>
                    {/*
                      A dot marks a destination whose screen is not written yet,
                      so nobody is surprised by the placeholder behind it.
                    */}
                    {!item.built && (
                      <span
                        title="Not built yet"
                        className="ml-auto h-1 w-1 shrink-0 rounded-full bg-slate-600"
                      />
                    )}
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
