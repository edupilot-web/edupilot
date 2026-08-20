import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  ClockIcon,
  FlameIcon,
  MegaphoneIcon,
  MinusCircleIcon,
  PlusIcon,
} from "@/components/icons";
import {
  DAILY_TASKS,
  NOTICES,
  PLACEMENT,
  STREAK,
  TIMETABLE,
  WALLET_BALANCE,
  WALLET_ENTRIES,
  formatRupees,
  taskCompletion,
} from "@/lib/dashboard-data";

/** The shared white card: same radius, border and padding for all six. */
function Card({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[16.5px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DailyTasksCard() {
  const percent = taskCompletion();

  return (
    <Card title="Daily Tasks">
      {/* Read-only: there is no tasks API to persist a tick against yet. */}
      <ul className="space-y-2.5">
        {DAILY_TASKS.map((task) => (
          <li key={task.label} className="flex items-center gap-2.5 text-[14px]">
            {task.done ? (
              <CheckCircleIcon className="h-[18px] w-[18px] shrink-0 text-emerald-500" />
            ) : (
              <span className="h-[18px] w-[18px] shrink-0 rounded-full border-[1.75px] border-slate-300 dark:border-slate-600" />
            )}
            <span
              className={
                task.done
                  ? "text-slate-400 line-through dark:text-slate-500"
                  : "text-slate-700 dark:text-slate-200"
              }
            >
              {task.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Daily task completion"
        >
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-[13px] font-semibold text-blue-600 dark:text-blue-400">{percent}%</span>
      </div>
    </Card>
  );
}

export function CampusWalletCard() {
  return (
    <Card
      title="Campus Wallet"
      action={
        <Link
          href="/wallet"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/25"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Top Up
        </Link>
      }
    >
      <p className="text-[28px] font-bold leading-none tracking-tight text-emerald-600 dark:text-emerald-400">
        {formatRupees(WALLET_BALANCE)}
      </p>

      <ul className="mt-4 space-y-2.5">
        {WALLET_ENTRIES.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2.5 text-[13.5px]">
            {/* A tick on a debit reads as "received"; the direction matters here. */}
            {entry.kind === "credit" ? (
              <CheckCircleIcon className="h-[17px] w-[17px] shrink-0 text-emerald-500" />
            ) : (
              <MinusCircleIcon className="h-[17px] w-[17px] shrink-0 text-slate-400 dark:text-slate-500" />
            )}
            <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
              {entry.label}
            </span>
            <span
              className={
                entry.kind === "credit"
                  ? "shrink-0 font-semibold text-emerald-600 dark:text-emerald-400"
                  : "shrink-0 font-semibold text-slate-500 dark:text-slate-400"
              }
            >
              {entry.kind === "credit" ? "+" : "−"}
              {formatRupees(entry.amount)}
            </span>
            <span className="w-9 shrink-0 text-right text-slate-400">{entry.when}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function StreaksCard() {
  return (
    <Card title="Streaks">
      <div className="flex items-center gap-3.5">
        <FlameIcon className="h-9 w-9 shrink-0 text-orange-500" />
        <div>
          <p className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-white">
            {STREAK.days} Day Streak
          </p>
          <ul className="mt-2 flex items-center gap-1.5" aria-label="This week's activity">
            {STREAK.week.map((done, index) => (
              <li
                key={index}
                title={done ? "Completed" : "Not yet"}
                className={`h-2.5 w-2.5 rounded-full ${
                  done ? "bg-[#12294f] dark:bg-blue-400" : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function TimetableCard() {
  return (
    <Card
      title="Today's Timetable"
      action={
        <Link
          href="/timetable"
          className="shrink-0 text-[13px] font-semibold text-blue-600 transition hover:underline dark:text-blue-400"
        >
          View all
        </Link>
      }
    >
      <ul className="space-y-3">
        {TIMETABLE.map((slot) => (
          <li key={slot.time} className="flex items-center gap-2.5 text-[14px]">
            <ClockIcon className="h-[17px] w-[17px] shrink-0 text-slate-400" />
            <span className="font-semibold text-slate-900 dark:text-white">{slot.time}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
              {slot.subject}
            </span>
            <span className="shrink-0 text-[13px] text-slate-400">{slot.room}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function NoticeBoardCard() {
  return (
    <Card
      title="Notice Board"
      action={
        <Link
          href="/notice-board"
          className="shrink-0 text-[13px] font-semibold text-blue-600 transition hover:underline dark:text-blue-400"
        >
          View all
        </Link>
      }
    >
      <ul className="space-y-3">
        {NOTICES.map((notice) => (
          <li key={notice.title} className="flex gap-2.5">
            <MegaphoneIcon className="mt-0.5 h-[17px] w-[17px] shrink-0 text-blue-500" />
            <div className="min-w-0">
              <p className="truncate text-[14px] text-slate-700 dark:text-slate-200">
                {notice.title}
              </p>
              <p className="text-[12px] text-slate-400">{notice.when}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PlacementsCard() {
  return (
    <Card title="Placements">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-[13px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"
        >
          {PLACEMENT.company.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-slate-900 dark:text-white">
            {PLACEMENT.role}
          </p>
          <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
            {PLACEMENT.company} · {PLACEMENT.location}
          </p>
          <p className="mt-0.5 text-[12.5px] font-medium text-amber-600 dark:text-amber-400">
            {PLACEMENT.closes}
          </p>
        </div>
        <Link
          href="/placements"
          className="shrink-0 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/25"
        >
          Apply
        </Link>
      </div>
    </Card>
  );
}
