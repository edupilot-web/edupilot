import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshIcon, ShieldIcon } from "@/components/admin/icons";
import { VerifyPanel } from "@/components/admin/verify-panel";
import { VerificationBadge } from "@/components/admin/status";
import {
  Badge,
  BUTTON_STYLES,
  Card,
  Field,
  FieldGrid,
  InfoNote,
  PageHeader,
} from "@/components/admin/ui";
import { recomputeProfileAction, verifyStudentAction } from "@/lib/admin/actions/students";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatDate, formatDateTime, formatRelative, initials } from "@/lib/admin/format";
import { getStudentDetail } from "@/lib/admin/data/students";

type Params = Promise<{ id: string }>;

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { id } = await props.params;
  const detail = await getStudentDetail(id, false);
  return { title: detail?.name ?? "Student" };
}

/**
 * The student record (spec §18).
 *
 * The completion meter is the point of the page: it says what is missing, not
 * just how far along the profile is, so a support agent can tell the student
 * exactly what to do rather than "your profile is 82% complete".
 */
export default async function StudentDetailPage(props: { params: Params }) {
  const { id } = await props.params;
  const admin = await requirePermission("student.view", `/admin/students/${id}`);
  const canSeePii = can(admin, "student.view_pii");

  const student = await getStudentDetail(id, canSeePii);
  if (!student) notFound();

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        breadcrumbs={[
          { label: "Student Management" },
          { label: "Students", href: "/admin/students" },
          { label: student.name },
        ]}
        title={
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-800 text-[12px] font-semibold text-white dark:bg-slate-700">
              {initials(student.name)}
            </span>
            {student.name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3">
            <span className={student.emailMasked ? "text-slate-400" : undefined}>
              {student.email}
            </span>
            {student.phone && <span>{student.phone}</span>}
            <span className="capitalize text-slate-400">{student.authProvider} sign-in</span>
          </span>
        }
        meta={
          <>
            {student.emailVerified ? (
              <Badge tone="success">Email verified</Badge>
            ) : (
              <Badge tone="danger">Email unverified</Badge>
            )}
            {student.profile?.profileCompleted ? (
              <Badge tone="success">Profile complete</Badge>
            ) : (
              <Badge tone="warning">Profile incomplete</Badge>
            )}
          </>
        }
        actions={
          can(admin, "student.impersonate") ? (
            <span
              title="Opens the platform as this student. Every action is recorded against your account."
              className={`${BUTTON_STYLES.secondary} cursor-not-allowed opacity-60`}
            >
              <ShieldIcon className="h-3.5 w-3.5" />
              View as user
            </span>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Card title="Personal information">
            <FieldGrid>
              <Field label="Full name" value={student.name} />
              <Field
                label="Email"
                value={
                  <span className={student.emailMasked ? "text-slate-400" : undefined}>
                    {student.email}
                  </span>
                }
              />
              <Field label="Phone" value={student.phone} />
              <Field label="City" value={student.city} />
              <Field label="Sign-in method" value={<span className="capitalize">{student.authProvider}</span>} />
              <Field label="Registered" value={formatDate(student.createdAt)} />
            </FieldGrid>
          </Card>

          <Card title="Academic information">
            {student.profile ? (
              <FieldGrid>
                <Field
                  label="College"
                  value={student.profile.collegeName}
                  href={student.college ? `/admin/colleges/${student.college.id}` : undefined}
                />
                <Field
                  label="University"
                  value={student.college?.universityName}
                  href={
                    student.college?.universityId
                      ? `/admin/universities/${student.college.universityId}`
                      : undefined
                  }
                />
                <Field label="Degree" value={student.profile.degree} />
                <Field label="Specialization" value={student.profile.specialization} />
                <Field
                  label="Status"
                  value={
                    <span className="capitalize">
                      {student.profile.studyStatus === "graduated" ? "Graduated" : "Studying"}
                    </span>
                  }
                />
                <Field label="Current year" value={student.profile.currentYear} />
                <Field label="Graduation year" value={student.profile.graduationYear} />
                <Field
                  label="College verification"
                  value={
                    student.college ? (
                      <VerificationBadge status={student.college.verificationStatus} />
                    ) : null
                  }
                />
                <Field label="Location" value={
                  student.college
                    ? [student.college.districtName, student.college.stateName].filter(Boolean).join(", ")
                    : null
                } />
              </FieldGrid>
            ) : (
              <p className="py-6 text-center text-[13px] text-slate-400">
                This student has not started onboarding. Nothing academic has been recorded yet.
              </p>
            )}
          </Card>

          <Card
            title="Activity"
            description="What this account has done on the platform."
          >
            <FieldGrid>
              <Field label="Course enrollments" value={student.enrollments} />
              <Field label="Profile created" value={formatDate(student.profile?.createdAt)} />
              <Field label="Profile updated" value={formatRelative(student.profile?.updatedAt)} />
              <Field label="Account updated" value={formatRelative(student.updatedAt)} />
            </FieldGrid>

            <div className="mt-4">
              <InfoNote>
                Posts, comments, connections and login history will appear here once those parts of
                the platform exist. Showing empty counters for features with no data would read as
                &ldquo;this student does nothing&rdquo; rather than &ldquo;nothing records it yet&rdquo;.
              </InfoNote>
            </div>
          </Card>

          {student.audit.length > 0 && (
            <Card title="Administrative history" padded={false}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {student.audit.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                    <span className="text-[12.5px] text-slate-700 dark:text-slate-200">
                      <span className="font-medium">{entry.actor}</span>{" "}
                      <span className="text-slate-500 dark:text-slate-400">{entry.action}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-slate-400" title={formatDateTime(entry.at)}>
                      {formatRelative(entry.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card title="Profile completion">
            <div className="flex items-baseline justify-between">
              <span className="text-[24px] font-semibold tabular-nums text-slate-900 dark:text-white">
                {student.completion}%
              </span>
              {student.profile?.profileCompleted && <Badge tone="success">Onboarded</Badge>}
            </div>

            <div
              role="progressbar"
              aria-valuenow={student.completion}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile completion"
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <div
                className={`h-full rounded-full ${
                  student.completion >= 90
                    ? "bg-emerald-500"
                    : student.completion >= 50
                      ? "bg-blue-500"
                      : "bg-amber-500"
                }`}
                style={{ width: `${Math.max(3, student.completion)}%` }}
              />
            </div>

            {student.missing.length > 0 ? (
              <>
                <p className="mt-3 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                  Missing
                </p>
                <ul className="mt-1 space-y-0.5">
                  {student.missing.map((entry) => (
                    <li key={entry} className="text-[12.5px] text-slate-600 dark:text-slate-300">
                      · {entry}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-[12.5px] text-slate-500 dark:text-slate-400">
                Everything is filled in, including the optional fields.
              </p>
            )}

            {can(admin, "student.edit") && student.profile && (
              <form action={recomputeProfileAction} className="mt-3">
                <input type="hidden" name="id" value={student.id} />
                <button type="submit" className={`${BUTTON_STYLES.secondary} w-full`}>
                  <RefreshIcon className="h-3.5 w-3.5" />
                  Recompute completion
                </button>
              </form>
            )}
          </Card>

          {can(admin, "student.verify") && (
            <VerifyPanel
              id={student.id}
              label="Email verification"
              status={student.emailVerified ? "verified" : "pending"}
              note={null}
              verifiedAt={null}
              action={verifyStudentAction}
            />
          )}

          {student.college && (
            <Card title="College">
              <Link
                href={`/admin/colleges/${student.college.id}`}
                className="text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {student.college.name}
              </Link>
              <p className="mt-1 text-[12px] text-slate-400">
                {[student.college.districtName, student.college.stateName].filter(Boolean).join(", ")}
              </p>
              <div className="mt-2">
                <VerificationBadge status={student.college.verificationStatus} />
              </div>
              <Link
                href={`/admin/students?college=${student.college.id}`}
                className="mt-3 block text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Other students here →
              </Link>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
