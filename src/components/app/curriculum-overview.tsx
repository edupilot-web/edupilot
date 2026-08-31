import Link from "next/link";
import {
  BookIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
} from "@/components/icons";
import { APP_ROUTES } from "@/lib/app-routes";
import type { CurriculumOverview, SubjectCard } from "@/lib/curriculum/student-curriculum";

/**
 * The semester's subjects, under a header that says where the student is.
 *
 * Every "nothing to show" case gets its own words and its own way out, rather
 * than one empty state: a college with no curriculum configured, a branch that
 * has none, and a semester that happens to be empty are three different
 * problems, and telling a student "no data" for all three is what makes an
 * incomplete product look like a broken one.
 */
export function CurriculumOverviewScreen({ overview }: { overview: CurriculumOverview }) {
  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-400">
        <Link
          href={APP_ROUTES.dashboard}
          className="transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          Dashboard
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="text-slate-500 dark:text-slate-400">Curriculum</span>
      </nav>

      <Header overview={overview} />

      <div className="mt-6">
        {overview.state.kind === "ready" ? (
          <SubjectGrid subjects={overview.state.subjects} />
        ) : (
          <EmptyState overview={overview} />
        )}
      </div>
    </div>
  );
}

function Header({ overview }: { overview: CurriculumOverview }) {
  const parts = [overview.branchName, overview.regulationCode].filter(Boolean);

  return (
    <header className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {overview.positionLabel}
          </p>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            {overview.collegeName || "Your curriculum"}
          </h1>
          {parts.length > 0 && (
            <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
              {parts.join(" · ")}
            </p>
          )}
        </div>

        {overview.semesterLabel && (
          <span className="shrink-0 rounded-full bg-slate-100 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {overview.semesterLabel}
          </span>
        )}
      </div>

      {/* The position is a guess whenever it was derived rather than confirmed,
          and a student reading the wrong semester's syllabus should be able to
          see why and say so — not discover it in an exam hall. */}
      {overview.position.source === "derived-from-admission" && (
        <Notice tone="info">
          Worked out from your {overview.position.year ? "admission year" : "profile"}
          {overview.position.storedYearConflicts
            ? " — which disagrees with the year saved on your profile."
            : "."}{" "}
          <Link href={APP_ROUTES.profile} className="font-semibold underline">
            Update your profile
          </Link>{" "}
          if this is not right.
        </Notice>
      )}

      {overview.position.beyondCourse && (
        <Notice tone="warn">
          This is past the last semester of your course, so we are showing the final one. If you have
          graduated, update your profile and we will put this away.
        </Notice>
      )}
    </header>
  );
}

function Notice({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const styles =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300";

  return (
    <p className={`mt-4 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${styles}`}>
      {children}
    </p>
  );
}

function SubjectGrid({ subjects }: { subjects: SubjectCard[] }) {
  const totalCredits = subjects.reduce((sum, subject) => sum + (subject.credits ?? 0), 0);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          This semester
        </h2>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          {subjects.length} subject{subjects.length === 1 ? "" : "s"}
          {totalCredits > 0 && ` · ${formatCredits(totalCredits)} credits`}
        </p>
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {subjects.map((subject) => (
          <li key={subject.id}>
            <SubjectTile subject={subject} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubjectTile({ subject }: { subject: SubjectCard }) {
  const hours = subject.readingMinutes > 0 ? subject.readingMinutes / 60 : 0;

  return (
    <Link
      href={`${APP_ROUTES.curriculum}/${subject.id}`}
      className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition hover:border-blue-300 hover:shadow-[0_4px_14px_rgba(37,99,235,0.10)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
            {subject.code}
          </p>
          <h3 className="mt-0.5 text-[15.5px] font-semibold leading-snug text-slate-900 transition group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
            {subject.name}
          </h3>
        </div>
        <TypeBadge type={subject.courseType} />
      </div>

      <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
        {subject.credits !== null && (
          <div className="flex items-center gap-1.5">
            <GraduationCapIcon className="h-3.5 w-3.5" />
            <dt className="sr-only">Credits</dt>
            <dd>{formatCredits(subject.credits)} credits</dd>
          </div>
        )}
        {subject.unitCount > 0 && (
          <div className="flex items-center gap-1.5">
            <FileTextIcon className="h-3.5 w-3.5" />
            <dt className="sr-only">Units</dt>
            <dd>
              {subject.unitCount} units · {subject.syllabusTopicCount} topics
            </dd>
          </div>
        )}
        {hours > 0 && (
          <div className="flex items-center gap-1.5">
            <ClockIcon className="h-3.5 w-3.5" />
            <dt className="sr-only">Reading time</dt>
            <dd>~{hours.toFixed(hours < 10 ? 1 : 0)}h reading</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto pt-4">
        {subject.primaryBookTitle ? (
          <p className="flex items-start gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
            <BookIcon className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">
              {subject.primaryBookTitle}
              {subject.bookCount > 1 && ` +${subject.bookCount - 1}`}
            </span>
          </p>
        ) : (
          // Said plainly rather than left blank: the syllabus is still there,
          // and a student should know the difference between "no textbook yet"
          // and "nothing here".
          <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
            Syllabus only — no textbook mapped yet
          </p>
        )}
      </div>
    </Link>
  );
}

function TypeBadge({ type }: { type: string }) {
  const elective = type.includes("Elective");
  const styles = elective
    ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
    : type === "Lab" || type === "Project"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      {type}
    </span>
  );
}

function EmptyState({ overview }: { overview: CurriculumOverview }) {
  const { state } = overview;
  const copy = emptyCopy(state, overview);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <BookIcon className="h-7 w-7" />
      </span>
      <h2 className="mt-5 text-[18px] font-semibold tracking-tight text-slate-900 dark:text-white">
        {copy.title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        {copy.body}
      </p>
      {copy.action && (
        <Link
          href={copy.action.href}
          className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          {copy.action.label}
        </Link>
      )}
    </div>
  );
}

function emptyCopy(
  state: CurriculumOverview["state"],
  overview: CurriculumOverview
): { title: string; body: string; action?: { href: string; label: string } } {
  switch (state.kind) {
    case "no-profile":
      return {
        title: "Finish setting up your profile",
        body: "We need your college, branch and year before we can show you a curriculum.",
        action: { href: APP_ROUTES.profile, label: "Complete your profile" },
      };

    case "graduated":
      return {
        title: "You have graduated",
        body: "There is no current semester to show. Your past subjects will appear here once we support looking back.",
      };

    case "no-regulation":
      return {
        title: "No curriculum for your college yet",
        body: `We do not have a syllabus configured for ${state.collegeName}. Once it is added, your subjects will appear here automatically — nothing more to do on your side.`,
        action: { href: APP_ROUTES.profile, label: "Check your profile details" },
      };

    case "no-subjects-for-branch":
      return {
        title: "Your branch is not configured yet",
        body: `${state.regulationCode ?? "The regulation"} is set up for your college, but ${
          state.branchName ?? "your branch"
        } has no subjects under it yet.`,
      };

    case "no-semester":
      return {
        title: "Which semester are you in?",
        body: state.year
          ? `We know you are in year ${state.year}, but not which half of it — and the two have different subjects. Add your admission year and we will work it out from now on.`
          : "Add your admission year to your profile and we will work out your semester from it.",
        action: { href: APP_ROUTES.profile, label: "Add your admission year" },
      };

    case "empty-semester":
      return {
        title: `Semester ${state.semester} is not filled in yet`,
        body: `Your college's ${
          overview.regulationCode ?? "curriculum"
        } has subjects for other semesters but not this one. It should appear once the syllabus for it is added.`,
      };

    default:
      return { title: "Nothing to show yet", body: "Check back shortly." };
  }
}

/** 1.5 credits is common for a lab, so trailing zeros are dropped, not padded. */
function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
