"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/brand";
import {
  CheckSquareIcon,
  ClipboardIcon,
  CloseIcon,
  DashboardIcon,
  FileTextIcon,
  LogOutIcon,
  MenuIcon,
  PresentIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { logoutAction } from "@/lib/auth-actions";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import type { TeacherStatus } from "@/lib/teaching/fields";

/**
 * The teacher application's chrome (§8, §69).
 *
 * A different shell from the student one, and deliberately plainer: this is a
 * tool somebody uses for twenty minutes to set work and mark it, not a place
 * to spend an evening. No streak, no upgrade card, no campus widgets — the
 * sidebar is seven destinations and the content area is as wide as the screen
 * allows.
 *
 * It reuses the student shell's *mechanics* — the same off-canvas drawer below
 * `lg`, the same focus rings, the same logout action — because those are solved
 * problems and a second implementation would be a second set of bugs.
 */

const NAV = [
  { href: TEACHER_ROUTES.dashboard, label: "Dashboard", icon: DashboardIcon },
  { href: TEACHER_ROUTES.assignments, label: "Assignments", icon: ClipboardIcon },
  { href: TEACHER_ROUTES.notes, label: "Notes", icon: FileTextIcon },
  { href: TEACHER_ROUTES.students, label: "Students", icon: UsersIcon },
  { href: TEACHER_ROUTES.profile, label: "Profile", icon: UserIcon },
];

export function TeacherShell({
  name,
  collegeName,
  status,
  canPublish,
  subjectCount,
  children,
}: {
  name: string;
  collegeName: string;
  status: TeacherStatus;
  canPublish: boolean;
  subjectCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f7f9fc] dark:bg-slate-950">
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Teacher navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-[#132033] transition-transform duration-200 lg:z-30 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <Link
            href={TEACHER_ROUTES.dashboard}
            className="inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
          >
            <BrandMark className="h-8 w-8 shrink-0" />
            <span className="text-[17px] font-bold tracking-tight text-white">EduPilot</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="mx-5 mt-2 inline-flex items-center gap-1.5 self-start rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          <PresentIcon className="h-3.5 w-3.5" />
          Teacher
        </p>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-3">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] transition outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 ${
                      active
                        ? "bg-blue-600 font-semibold text-white"
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
        </nav>

        <div className="border-t border-white/5 p-4">
          <p className="truncate text-[13px] font-semibold text-white">{name}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-slate-400">{collegeName}</p>

          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-[#f7f9fc]/90 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/90">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-200/70 lg:hidden dark:hover:bg-slate-800"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <p className="truncate text-[14px] font-medium text-slate-600 dark:text-slate-300">
            {collegeName}
          </p>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <StatusBanner status={status} canPublish={canPublish} subjectCount={subjectCount} />
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The one thing a teacher needs to know before they try anything (§89).
 *
 * A pending account can write drafts and cannot publish; an approved one with
 * no subjects cannot even start. Both are states where every button the teacher
 * presses will refuse them, and discovering that one button at a time is a bad
 * first day. Shown above the content on every screen until it no longer
 * applies.
 */
function StatusBanner({
  status,
  canPublish,
  subjectCount,
}: {
  status: TeacherStatus;
  canPublish: boolean;
  subjectCount: number;
}) {
  if (status === "pending") {
    return (
      <Banner tone="amber" title="Your account is waiting for approval">
        You can look around and save drafts. Publishing to students opens up once your college
        approves the account.
      </Banner>
    );
  }

  if (status === "suspended") {
    return (
      <Banner tone="rose" title="Your account is suspended">
        You can still see what you published and what students submitted. Contact your college
        administrator to have it reinstated.
      </Banner>
    );
  }

  if (status === "rejected" || status === "deactivated") {
    return (
      <Banner tone="rose" title="Your account is not active">
        Contact your college administrator for details.
      </Banner>
    );
  }

  if (!canPublish) {
    return (
      <Banner tone="amber" title="Confirm your email address">
        We sent you a link when you signed up. You need a confirmed address before you can publish
        to students.
      </Banner>
    );
  }

  if (subjectCount === 0) {
    return (
      <Banner tone="blue" title="No subjects assigned yet">
        Your college decides which subjects you teach. Until one is assigned there is nothing to
        set work for — ask your administrator to add you to a subject.
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "amber" | "rose" | "blue";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    amber:
      "border-amber-200/70 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
    rose: "border-rose-200/70 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200",
    blue: "border-blue-200/70 bg-blue-50 text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200",
  };

  return (
    <div className={`mb-5 rounded-xl border p-4 ${styles[tone]}`}>
      <p className="flex items-center gap-2 text-[13.5px] font-semibold">
        <CheckSquareIcon className="h-4 w-4" />
        {title}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed opacity-90">{children}</p>
    </div>
  );
}
