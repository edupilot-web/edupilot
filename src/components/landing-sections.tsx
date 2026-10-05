import Link from "next/link";
import {
  BookIcon,
  CheckSquareIcon,
  ClipboardIcon,
  FileTextIcon,
  RobotIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";

/**
 * The landing page's body, for one audience at a time.
 *
 * Students and teachers want different things from this page and neither is
 * served by scrolling past the other. The previous version stacked both —
 * features, how it works, a teacher section, a closing call to action — which
 * meant a teacher had to scroll through six student features before reaching
 * anything addressed to them, and a student had to scroll past a teacher
 * section to reach the end.
 *
 * So the page shows **one** audience and offers a switch. Students are the
 * default because they are almost all of the traffic; a teacher arriving from a
 * colleague's link can be sent straight to `?for=teachers`.
 *
 * The switch is a **link, not client state**. It costs a navigation, which Next
 * makes cheap, and buys three things state would not: the teacher view is
 * server-rendered rather than appearing after hydration, it is shareable, and
 * there is no flash of the wrong audience on first paint.
 */

export type Audience = "students" | "teachers";

export function isAudience(value: unknown): value is Audience {
  return value === "students" || value === "teachers";
}

// ── The switch ────────────────────────────────────────────────────────────

export function AudienceSwitch({
  audience,
  className = "",
}: {
  audience: Audience;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex rounded-full bg-slate-100 p-1 dark:bg-slate-800 ${className}`}
      role="group"
      aria-label="Who are you?"
    >
      {(
        [
          ["students", "For students"],
          ["teachers", "For teachers"],
        ] as const
      ).map(([key, label]) => (
        <Link
          key={key}
          href={key === "students" ? "/" : "/?for=teachers"}
          aria-current={audience === key ? "true" : undefined}
          className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition ${
            audience === key
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────

const STUDENT_FEATURES = [
  {
    Icon: BookIcon,
    title: "Your actual syllabus",
    body: "Your college, branch and regulation decide what you see — not a generic course list.",
  },
  {
    Icon: RobotIcon,
    title: "A tutor that stays on topic",
    body: "Answers grounded in the topic you are on, at the depth you asked for.",
  },
  {
    Icon: ClipboardIcon,
    title: "Assignments and notes",
    body: "What is due, what you handed in, what it was marked, and everything your teachers share.",
  },
  {
    Icon: WalletIcon,
    title: "A campus wallet",
    body: "Add money once with a card or UPI. Every movement is on a statement you can read.",
  },
];

const TEACHER_FEATURES = [
  {
    Icon: UsersIcon,
    title: "The audience resolves itself",
    body: "Choose the subject you teach. EduPilot works out who is in that cohort this semester.",
  },
  {
    Icon: ClipboardIcon,
    title: "Publish once",
    body: "One action reaches everyone — nobody missed because they joined late or moved branch.",
  },
  {
    Icon: CheckSquareIcon,
    title: "Mark and give feedback",
    body: "See who has handed in, mark it, and leave comments they can actually read.",
  },
  {
    Icon: FileTextIcon,
    title: "Reminders go out on their own",
    body: "Deadlines are chased for you, and nobody is told twice about the same one.",
  },
];

const COPY: Record<
  Audience,
  {
    eyebrow: string;
    heading: React.ReactNode;
    body: string;
    features: typeof STUDENT_FEATURES;
    note: string;
  }
> = {
  students: {
    eyebrow: "Built around your regulation and semester",
    heading: (
      <>
        Your syllabus.
        <br />
        Explained, and kept up with.
      </>
    ),
    body: "Pick your college, branch and regulation once. EduPilot lays out the subjects you are actually taking, explains every topic, answers questions about them, and keeps your teachers' assignments and notes in one place.",
    features: STUDENT_FEATURES,
    /**
     * Said on the page rather than discovered after signing up.
     *
     * Only a handful of colleges have a curriculum configured. A student from
     * one of the others would otherwise onboard and find an empty Curriculum
     * screen with no explanation.
     */
    note: "Your college not set up yet? You can still sign up and tell us which one is missing. Assignments, notes and the wallet work either way.",
  },
  teachers: {
    eyebrow: "For teachers",
    heading: (
      <>
        Choose a subject,
        <br />
        not a list of students.
      </>
    ),
    body: "Set an assignment against the subject you teach and EduPilot works out who is in that cohort this semester. No spreadsheets, no mailing lists, and nobody missed because they joined late.",
    features: TEACHER_FEATURES,
    /** The approval gate, before somebody signs up and wonders why they cannot publish. */
    note: "New teacher accounts are approved by your college before they can publish.",
  },
};

export function LandingBody({
  audience,
  signedIn,
}: {
  audience: Audience;
  signedIn: boolean;
}) {
  const copy = COPY[audience];
  const teachers = audience === "teachers";

  return (
    <>
      <section className="border-b border-slate-200/70 bg-gradient-to-br from-[#eaf1fe] via-[#f2f7ff] to-[#fbfcff] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="mx-auto max-w-[1180px] px-5 py-14 lg:px-10 lg:py-20">
          <AudienceSwitch audience={audience} className="lg:hidden" />

          <p
            className={`text-[13px] font-semibold ${
              teachers ? "text-indigo-600 dark:text-indigo-300" : "text-blue-600 dark:text-blue-300"
            } mt-5 lg:mt-0`}
          >
            {copy.eyebrow}
          </p>

          <h1 className="mt-3 max-w-[22ch] text-[32px] font-bold leading-[1.15] tracking-tight text-[#101a37] sm:text-[40px] lg:text-[46px] dark:text-white">
            {copy.heading}
          </h1>

          <p className="mt-5 max-w-[46rem] text-[16px] leading-relaxed text-slate-500 lg:text-[17px] dark:text-slate-400">
            {copy.body}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {teachers ? (
              <>
                <Link
                  href="/teacher/signup"
                  className="rounded-xl bg-indigo-600 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30"
                >
                  Create a teacher account
                </Link>
                <Link
                  href="/teacher/login"
                  className="rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
                >
                  Teacher sign in
                </Link>
              </>
            ) : (
              <>
                {/* Somebody already signed in wants to get back in, not to join. */}
                <Link
                  href={signedIn ? "/dashboard" : "/signup"}
                  className="rounded-xl bg-blue-600 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                >
                  {signedIn ? "Go to your dashboard" : "Get started free"}
                </Link>
                {!signedIn && (
                  <Link
                    href="/login"
                    className="rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
                  >
                    Sign in
                  </Link>
                )}
              </>
            )}
          </div>

          <p className="mt-5 max-w-[46rem] text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">
            {copy.note}
          </p>
        </div>
      </section>

      <section className="bg-white py-14 dark:bg-slate-950">
        <div className="mx-auto max-w-[1180px] px-5 lg:px-10">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.features.map(({ Icon, title, body }) => (
              <li
                key={title}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    teachers
                      ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
                      : "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-3.5 text-[15.5px] font-semibold text-slate-900 dark:text-white">
                  {title}
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────

/**
 * Every link here resolves.
 *
 * A footer is the easiest place in a product to accumulate links to pages
 * somebody meant to write, so this one is deliberately short.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <p className="text-[13px] text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} EduPilot
        </p>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {[
            ["Sign in", "/login"],
            ["For teachers", "/?for=teachers"],
            ["Terms", "/terms"],
            ["Privacy", "/privacy"],
            ["API", "/api-reference"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-[13.5px] text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
