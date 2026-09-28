import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TEACHER_STATUS_BLURBS, TEACHER_STATUS_LABELS } from "@/lib/teaching/fields";
import { getCurrentTeacher, listTeacherSubjects } from "@/lib/teaching/teacher";

export const metadata: Metadata = { title: "Profile · EduPilot for teachers" };

/**
 * The teacher's own record (§58).
 *
 * The college is shown and is **not** editable: it is the scope every query in
 * the module is confined to, and letting a teacher change it would be letting
 * them choose whose students they can publish to (§10). Moving institutions is
 * a new account, or an administrator's action — not a form field.
 *
 * Their subjects are shown for the same reason they cannot be edited here:
 * §11 puts that decision with the college, and a teacher who could assign
 * themselves a subject would make the whole authorisation model decorative.
 */
export default async function Page() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const subjects = await listTeacherSubjects(teacher);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
        Your profile
      </h1>

      <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={teacher.name} />
          <Field label="Email" value={teacher.email} />
          <Field label="College" value={teacher.collegeName} locked />
          <Field label="Department" value={teacher.departmentName ?? "Not set"} />
          <Field label="Designation" value={teacher.designation ?? "Not set"} />
          <Field label="Employee ID" value={teacher.employeeId ?? "Not set"} />
        </dl>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
            {TEACHER_STATUS_LABELS[teacher.status]}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            {TEACHER_STATUS_BLURBS[teacher.status]}
          </p>
          {!teacher.emailVerified && (
            <p className="mt-2 text-[13px] text-amber-700 dark:text-amber-300">
              Your email address is not confirmed yet, so you cannot publish to students.
            </p>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
          Subjects you teach
        </h2>
        <p className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">
          Your college decides this. Ask an administrator to add or remove a subject.
        </p>

        {subjects.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500 dark:text-slate-400">
            None assigned yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {subjects.map((subject) => (
              <li
                key={subject.subjectId}
                className="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800"
              >
                <p className="text-[14px] font-medium text-slate-900 dark:text-white">
                  {subject.name}
                </p>
                <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                  {subject.code} · {subject.branchName} · {subject.regulationCode} · Year{" "}
                  {subject.year}, Semester {subject.semester}
                  {subject.admissionYear ? ` · ${subject.admissionYear} intake` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, locked }: { label: string; value: string; locked?: boolean }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-[14px] text-slate-800 dark:text-slate-100">
        {value}
        {locked && (
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            fixed
          </span>
        )}
      </dd>
    </div>
  );
}
