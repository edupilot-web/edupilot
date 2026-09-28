import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  ClipboardIcon,
  FileTextIcon,
  FlameIcon,
  GiftIcon,
  MegaphoneIcon,
  TicketIcon,
  WalletIcon,
} from "@/components/icons";
import { APP_ROUTES } from "@/lib/app-routes";
import { dueLabel, type DashboardData } from "@/lib/dashboard-data";

/**
 * The dashboard cards.
 *
 * Every card here is rendered from `getDashboard()` and therefore from the
 * database. The previous set — a wallet, a timetable, a notice board and a
 * placement — were constants, and the screen was the one place in the product
 * that contradicted the student's own profile. Each of those sections is still
 * on the roadmap; until a model backs one, it appears in `ComingSoonCard` as a
 * link to a page that says it is not built, rather than as a card full of
 * numbers that look real.
 */

/** The shared white card: same radius, border and padding throughout. */
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

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
    >
      {children}
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-1 text-[14px] text-slate-500 dark:text-slate-400">{children}</p>;
}

// ── This semester ───────────────────────────────────────────────────────

export function SemesterCard({ data }: { data: DashboardData }) {
  const { academic, subjects } = data;

  return (
    <Card
      title={academic.semesterLabel ?? academic.positionLabel}
      action={<CardLink href={APP_ROUTES.curriculum}>Curriculum</CardLink>}
    >
      <p className="text-[13.5px] text-slate-500 dark:text-slate-400">
        {[academic.branchName, academic.collegeName, academic.regulationCode]
          .filter(Boolean)
          .join(" · ") || "Your academic details are not set up yet."}
      </p>

      {subjects.total > 0 ? (
        <>
          <ul className="mt-3.5 space-y-2">
            {subjects.top.map((subject) => (
              <li key={subject.id} className="flex items-baseline justify-between gap-3">
                <Link
                  href={`${APP_ROUTES.curriculum}/${subject.id}`}
                  className="truncate text-[14px] text-slate-700 hover:underline dark:text-slate-200"
                >
                  {subject.name}
                </Link>
                <span className="shrink-0 text-[12.5px] text-slate-400 dark:text-slate-500">
                  {subject.code}
                </span>
              </li>
            ))}
          </ul>
          {subjects.total > subjects.top.length && (
            <p className="mt-3 text-[13px] text-slate-400 dark:text-slate-500">
              and {subjects.total - subjects.top.length} more
            </p>
          )}
        </>
      ) : (
        <Empty>{academic.emptyReason ?? "No subjects for this semester yet."}</Empty>
      )}

      {/* A derived position is a guess, and the student is the only one who can
          correct it. Saying so here is cheaper than them finding out in an exam
          hall. */}
      {academic.derived && subjects.total > 0 && (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          Worked out from your admission batch.{" "}
          <Link href={APP_ROUTES.profile} className="font-semibold underline">
            Update your profile
          </Link>{" "}
          if this is not right.
        </p>
      )}
    </Card>
  );
}

// ── Assignments ─────────────────────────────────────────────────────────

export function AssignmentsCard({ data }: { data: DashboardData }) {
  const { dueSoon, pending, overdue } = data.assignments;

  return (
    <Card
      title="Due soon"
      action={<CardLink href={APP_ROUTES.assignments}>All assignments</CardLink>}
    >
      {dueSoon.length ? (
        <ul className="space-y-3">
          {dueSoon.map((card) => (
            <li key={card.id}>
              <Link href={`${APP_ROUTES.assignments}/${card.id}`} className="group block">
                <div className="flex items-start justify-between gap-3">
                  <span className="truncate text-[14px] font-medium text-slate-800 group-hover:underline dark:text-slate-100">
                    {card.title}
                  </span>
                  <span
                    className={`shrink-0 text-[12.5px] font-semibold ${
                      card.displayStatus === "overdue"
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {dueLabel(card.dueAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-slate-400 dark:text-slate-500">
                  {[card.subjectName, card.teacherName].filter(Boolean).join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          {pending + overdue === 0
            ? "Nothing is due. You are all caught up."
            : "Nothing due in the next fortnight."}
        </Empty>
      )}

      {(pending > 0 || overdue > 0) && (
        <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-[13px] dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400">
            <strong className="font-semibold text-slate-800 dark:text-slate-100">{pending}</strong>{" "}
            pending
          </span>
          {overdue > 0 && (
            <span className="text-rose-600 dark:text-rose-400">
              <strong className="font-semibold">{overdue}</strong> overdue
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Study activity ──────────────────────────────────────────────────────

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function StudyCard({ data }: { data: DashboardData }) {
  const { streakDays, week, topicsStarted, topicsCompleted, minutesSpent } = data.study;

  return (
    <Card title="Your studying" action={<CardLink href={APP_ROUTES.aiTutor}>AI Tutor</CardLink>}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10">
          <FlameIcon
            className={`h-5 w-5 ${streakDays > 0 ? "text-amber-500" : "text-slate-300 dark:text-slate-600"}`}
          />
        </span>
        <div>
          <p className="text-[16px] font-semibold text-slate-900 dark:text-white">
            {streakDays === 0
              ? "No streak yet"
              : streakDays === 1
                ? "1 day streak"
                : `${streakDays} day streak`}
          </p>
          <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
            {streakDays === 0 ? "Open a topic to start one" : "Days in a row you have studied"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5" aria-hidden="true">
        {week.map((active, index) => (
          <span
            key={index}
            className={`flex h-7 flex-1 items-center justify-center rounded-md text-[11px] font-semibold ${
              active
                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
            }`}
          >
            {WEEKDAYS[index]}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3.5 dark:border-slate-800">
        <Stat label="Topics opened" value={topicsStarted} />
        <Stat label="Completed" value={topicsCompleted} />
        <Stat label="Minutes" value={minutesSpent} />
      </dl>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[12px] text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-[18px] font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────

export function NotesCard({ data }: { data: DashboardData }) {
  const { recent, total } = data.notes;

  return (
    <Card title="Notes from your teachers" action={<CardLink href={APP_ROUTES.notes}>All notes</CardLink>}>
      {recent.length ? (
        <ul className="space-y-3">
          {recent.map((note) => (
            <li key={note.id}>
              <Link href={`${APP_ROUTES.notes}/${note.id}`} className="group block">
                <div className="flex items-start justify-between gap-3">
                  <span className="truncate text-[14px] font-medium text-slate-800 group-hover:underline dark:text-slate-100">
                    {note.title}
                  </span>
                  {!note.viewedAt && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-slate-400 dark:text-slate-500">
                  {[note.subjectName, note.teacherName].filter(Boolean).join(" · ")}
                  {note.attachmentCount > 0 &&
                    ` · ${note.attachmentCount} file${note.attachmentCount === 1 ? "" : "s"}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No notes have been shared with you yet.</Empty>
      )}

      {total > recent.length && (
        <p className="mt-3 text-[13px] text-slate-400 dark:text-slate-500">
          and {total - recent.length} more
        </p>
      )}
    </Card>
  );
}

// ── The rest of the product ─────────────────────────────────────────────

/**
 * The sections that are not built.
 *
 * Kept on the dashboard deliberately: these were the fabricated cards, and
 * removing them without trace would hide the roadmap from the person it is for.
 * Each links to its own page, which says plainly that it is not built — so the
 * dashboard promises nothing the next tap does not honour.
 */
const UPCOMING = [
  { label: "Timetable", href: APP_ROUTES.timetable, Icon: CalendarIcon },
  { label: "Notice board", href: APP_ROUTES.noticeBoard, Icon: MegaphoneIcon },
  { label: "Placements", href: APP_ROUTES.placements, Icon: BriefcaseIcon },
  { label: "Campus wallet", href: APP_ROUTES.wallet, Icon: WalletIcon },
  { label: "Events", href: APP_ROUTES.events, Icon: TicketIcon },
  { label: "Score booster", href: APP_ROUTES.scoreBooster, Icon: ClipboardIcon },
  { label: "Mock interviews", href: APP_ROUTES.mockInterviews, Icon: FileTextIcon },
  { label: "Service requests", href: APP_ROUTES.serviceRequests, Icon: BookIcon },
  { label: "Refer a friend", href: APP_ROUTES.refer, Icon: GiftIcon },
];

export function ComingSoonCard() {
  return (
    <Card title="Coming soon" className="xl:col-span-2">
      <p className="-mt-1 mb-3.5 text-[13.5px] text-slate-500 dark:text-slate-400">
        These are part of EduPilot but are not built yet. Nothing here has data behind it.
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {UPCOMING.map(({ label, href, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-[13.5px] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
