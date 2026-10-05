import Link from "next/link";

/**
 * Student or teacher, on one sign-up page.
 *
 * There were two pages, `/signup` and `/teacher/signup`, and a teacher who
 * followed the obvious link from the landing page landed on the student form
 * with no way across. The two forms ask for genuinely different things — a
 * teacher needs a college and has to clear that college's policy — so they stay
 * separate *forms*, reached from one place.
 *
 * A link rather than client state, for the same reasons the landing page's
 * audience switch is: the teacher form is server-rendered with its invitation
 * already resolved, the URL is shareable, and an invitation link can point
 * straight at `?role=teacher&invite=…`.
 */
export function SignupRoleSwitch({
  role,
  next,
}: {
  role: "student" | "teacher";
  next?: string;
}) {
  const suffix = next ? `&next=${encodeURIComponent(next)}` : "";

  return (
    <div
      className="mb-5 inline-flex w-full rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
      role="group"
      aria-label="What are you signing up as?"
    >
      {(
        [
          ["student", "I'm a student"],
          ["teacher", "I'm a teacher"],
        ] as const
      ).map(([key, label]) => (
        <Link
          key={key}
          href={key === "student" ? `/signup${next ? `?next=${encodeURIComponent(next)}` : ""}` : `/signup?role=teacher${suffix}`}
          aria-current={role === key ? "true" : undefined}
          className={`flex-1 rounded-lg px-4 py-2 text-center text-[13.5px] font-semibold transition ${
            role === key
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
