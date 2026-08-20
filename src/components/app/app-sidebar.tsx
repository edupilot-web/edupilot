"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { CloseIcon, CrownIcon } from "@/components/icons";
import { NAV_GROUPS } from "@/components/app/nav";

/**
 * The dark navigation rail from the design. Fixed from `lg` up; below that it
 * is an off-canvas drawer the top bar opens, since 240px of chrome would leave
 * no room for the dashboard on a phone.
 */
export function AppSidebar({
  open,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Scrim, mobile only */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-[#0d1f3f] transition-transform duration-200 lg:z-30 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
          >
            <BrandMark className="h-8 w-8 shrink-0" />
            <span className="text-[18px] font-bold tracking-tight text-white">EduPilot</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-1.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mb-0.5">
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {group.heading}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] transition outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 ${
                          active
                            ? "bg-blue-600 font-semibold text-white shadow-sm shadow-blue-950/40"
                            : "font-medium text-slate-300 hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 p-3">
          <div className="rounded-xl bg-[#16294d] p-3.5">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-white">
              <CrownIcon className="h-[17px] w-[17px] text-amber-400" />
              Upgrade to Pro
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-slate-400">
              Unlock premium courses and career tools.
            </p>
            <button
              type="button"
              onClick={onUpgrade}
              className="mt-2.5 w-full rounded-lg bg-blue-600 py-[7px] text-[13px] font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
