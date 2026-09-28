import Link from "next/link";
import { ClipboardIcon, ClockIcon, CheckCircleIcon, AlertIcon } from "@/components/icons";
import { APP_ROUTES } from "@/lib/app-routes";
import type {
  AssignmentFilter,
  StudentAssignmentCard,
} from "@/lib/teaching/student-view";

/**
 * The student's assignment list (§25, §69).
 *
 * A server component: the filter lives in the URL, so a tab is a link and the
 * page is shareable, bookmarkable and works with the back button. Shipping a
 * client bundle to toggle four tabs would be a cost paid on every load for
 * behaviour a link already has.
 *
 * Status is shown with a **word and a shape**, not a colour alone — a red dot
 * and a green dot are the same dot to a red-green colourblind reader, and this
 * is the screen where the difference is "you have handed this in" versus "you
 * have not".
 */

const TABS: { key: AssignmentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "submitted", label: "Submitted" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export function AssignmentList({
  cards,
  counts,
  filter,
}: {
  cards: StudentAssignmentCard[];
  counts: Record<AssignmentFilter, number>;
  filter: AssignmentFilter;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Assignments
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            Work set for the subjects you are taking this semester.
          </p>
        </div>

        {counts.overdue > 0 && (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-[13px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertIcon className="h-4 w-4" />
            {counts.overdue} overdue
          </p>
        )}
      </header>

      <nav aria-label="Filter assignments" className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const active = tab.key === filter;
          return (
            <Link
              key={tab.key}
              href={tab.key === "all" ? APP_ROUTES.assignments : `${APP_ROUTES.assignments}?filter=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
              <span className={active ? "opacity-70" : "text-slate-400"}>{counts[tab.key]}</span>
            </Link>
          );
        })}
      </nav>

      {cards.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="mt-4 space-y-2.5">
          {cards.map((card) => (
            <li key={card.id}>
              <AssignmentCard card={card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignmentCard({ card }: { card: StudentAssignmentCard }) {
  return (
    <Link
      href={`${APP_ROUTES.assignments}/${card.id}`}
      className="flex items-start gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"
    >
      <StatusGlyph status={card.displayStatus} />

      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {card.subjectCode ? `${card.subjectCode} · ` : ""}
          {card.subjectName ?? "Subject"}
        </p>
        <h2 className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
          {card.title}
        </h2>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-slate-500 dark:text-slate-400">
          {card.teacherName && <span>{card.teacherName}</span>}
          {card.dueAt && (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" />
              Due {formatDue(card.dueAt)}
            </span>
          )}
          {card.isClosed && <span className="text-slate-400">Closed</span>}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <StatusBadge status={card.displayStatus} />
        {card.marks !== null && (
          <p className="mt-1.5 text-[13px] font-semibold tabular-nums text-slate-900 dark:text-white">
            {card.marks}
            {card.maxMarks !== null && (
              <span className="font-normal text-slate-400"> / {card.maxMarks}</span>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * The status, as a shape as well as a colour (§79 of the curriculum module's
 * accessibility rule, and plain sense here).
 */
function StatusGlyph({ status }: { status: StudentAssignmentCard["displayStatus"] }) {
  const shared = "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg";

  if (status === "graded") {
    return (
      <span className={`${shared} bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400`}>
        <CheckCircleIcon className="h-[18px] w-[18px]" />
      </span>
    );
  }
  if (status === "submitted") {
    return (
      <span className={`${shared} bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400`}>
        <CheckCircleIcon className="h-[18px] w-[18px]" />
      </span>
    );
  }
  if (status === "overdue") {
    return (
      <span className={`${shared} bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400`}>
        <AlertIcon className="h-[18px] w-[18px]" />
      </span>
    );
  }
  return (
    <span className={`${shared} bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}>
      <ClipboardIcon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function StatusBadge({ status }: { status: StudentAssignmentCard["displayStatus"] }) {
  const styles: Record<StudentAssignmentCard["displayStatus"], string> = {
    pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    submitted: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    overdue: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    graded: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  };

  const labels: Record<StudentAssignmentCard["displayStatus"], string> = {
    pending: "Pending",
    submitted: "Submitted",
    overdue: "Overdue",
    graded: "Graded",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function EmptyState({ filter }: { filter: AssignmentFilter }) {
  /**
   * Different words per tab (§88).
   *
   * "You don't have any assignments yet" under the Overdue tab would be wrong
   * and alarming in opposite directions — it reads as though the platform lost
   * them. Each tab says what its own emptiness means.
   */
  const copy: Record<AssignmentFilter, { title: string; body: string }> = {
    all: {
      title: "No assignments yet",
      body: "When a teacher sets work for one of your subjects, it will appear here and you will get a notification.",
    },
    pending: { title: "Nothing pending", body: "You are up to date on everything that has been set." },
    submitted: { title: "Nothing submitted yet", body: "Work you hand in will be listed here." },
    overdue: { title: "Nothing overdue", body: "You have not missed a deadline." },
    completed: { title: "Nothing graded yet", body: "Marks and feedback appear here once a teacher has marked your work." },
  };

  const { title, body } = copy[filter];

  return (
    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <ClipboardIcon className="h-6 w-6" />
      </span>
      <p className="mt-3.5 text-[15px] font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
        {body}
      </p>
    </div>
  );
}

/**
 * "Tomorrow, 11:59 pm" where that is clearer than a date.
 *
 * A deadline is read as a countdown, not a calendar entry — "in 2 days" is what
 * a student acts on, and an absolute date makes them do the arithmetic.
 */
export function formatDue(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.round((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  if (days === 0) return `today, ${time}`;
  if (days === 1) return `tomorrow, ${time}`;
  if (days === -1) return `yesterday, ${time}`;
  if (days > 1 && days <= 7) return `in ${days} days, ${time}`;
  if (days < -1 && days >= -7) return `${Math.abs(days)} days ago`;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}
