import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersIcon } from "@/components/icons";
import { getCurrentTeacher, listTeacherSubjects } from "@/lib/teaching/teacher";
import { listTeacherStudents } from "@/lib/teaching/teacher-view";

export const metadata: Metadata = { title: "Students · EduPilot for teachers" };

/**
 * The students a teacher can see (§45).
 *
 * Resolved from the subjects they are assigned, so this list is their classes
 * rather than the platform's student directory. A teacher cannot reach a
 * student they do not teach, and the columns are what §45 allows — name, email,
 * cohort, and which of their subjects the student takes.
 *
 * There is no phone number, no city and no link to a profile: a teacher marking
 * work has no need for any of them, and the query never fetched them.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const params = await props.searchParams;
  const search = typeof params.q === "string" ? params.q : null;
  const subjectId = typeof params.subjectId === "string" ? params.subjectId : null;

  const subjects = await listTeacherSubjects(teacher);
  const { students, total } = await listTeacherStudents(teacher, subjects, { search, subjectId });

  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Students
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          Everyone currently taking one of your subjects — {total}{" "}
          {total === 1 ? "student" : "students"}.
        </p>
      </header>

      <form className="mt-5 flex flex-wrap gap-2">
        <label htmlFor="student-search" className="sr-only">
          Search students
        </label>
        <input
          id="student-search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search by name or email"
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />

        <label htmlFor="subject-filter" className="sr-only">
          Filter by subject
        </label>
        <select
          id="subject-filter"
          name="subjectId"
          defaultValue={subjectId ?? ""}
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">All my subjects</option>
          {subjects.map((subject) => (
            <option key={subject.subjectId} value={subject.subjectId}>
              {subject.code} — {subject.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Filter
        </button>
      </form>

      {students.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <UsersIcon className="h-6 w-6" />
          </span>
          <p className="mt-3.5 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
            {subjects.length === 0 ? "No subjects assigned yet" : "No students match"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            {subjects.length === 0
              ? "Your college decides which subjects you teach. Students appear here once one is assigned."
              : "Nobody is currently enrolled in the year and semester of the subjects you teach."}
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-left dark:border-slate-800">
                <th className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                  Student
                </th>
                <th className="hidden px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 sm:table-cell">
                  Batch
                </th>
                <th className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                  Subjects with you
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="px-4 py-2.5">
                    <p className="text-[13.5px] font-medium text-slate-900 dark:text-white">
                      {student.name}
                    </p>
                    <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                      {student.email}
                    </p>
                  </td>
                  <td className="hidden px-4 py-2.5 text-[13px] text-slate-500 sm:table-cell dark:text-slate-400">
                    {student.admissionYear ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-slate-600 dark:text-slate-300">
                    {student.subjects.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
