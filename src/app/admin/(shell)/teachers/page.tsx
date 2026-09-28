import type { Metadata } from "next";
import { Cell, Column, DataTable, PrimaryCell, Row } from "@/components/admin/data-table";
import { Badge, Card, EmptyState, PageHeader, type BadgeTone } from "@/components/admin/ui";
import { TeacherRowActions } from "@/components/admin/teacher-actions";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber, formatRelative } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { listTeachers } from "@/lib/admin/data/teachers";
import { hasPermission } from "@/lib/admin/permissions";
import { TEACHER_STATUS_LABELS, type TeacherStatus } from "@/lib/teaching/fields";

export const metadata: Metadata = { title: "Teachers" };

const BASE = "/admin/teachers";

const COLUMNS: Column[] = [
  { key: "teacher", label: "Teacher" },
  { key: "college", label: "College", secondary: true },
  { key: "department", label: "Department", secondary: true },
  { key: "subjects", label: "Subjects", numeric: true },
  { key: "status", label: "Status" },
  { key: "joined", label: "Signed up", secondary: true },
  { key: "actions", label: "" },
];

const TABS = [
  { key: "pending", label: "Awaiting approval" },
  { key: "active", label: "Active" },
  { key: "all", label: "All" },
];

/**
 * Teacher management (§56).
 *
 * The pending tab is the default, because that is the queue: a teacher who has
 * signed up and not been approved cannot do anything, and every day they sit
 * there is a day their students get nothing.
 *
 * The list is scoped to the administrator's own college when they have one.
 * There is no college parameter — the scope comes from their record, so a
 * college admin cannot express "show me another institution's teachers" and a
 * platform admin does not have to.
 */
export default async function TeachersPage(props: { searchParams: Promise<SearchParams> }) {
  const admin = await requirePermission("teacher.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const status = typeof params.status === "string" ? params.status : "pending";
  const search = typeof params.q === "string" ? params.q : "";

  const { rows, total, pending } = await listTeachers(admin, { status, search, limit: 50 });

  const canApprove = hasPermission(admin.permissions, "teacher.approve");
  const canAssign = hasPermission(admin.permissions, "teacher.assign");

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Teacher accounts, their approval, and the subjects each one may publish to. A teacher with no subject assigned cannot publish anything at all."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Teachers" }]}
        meta={
          pending > 0 ? (
            <Badge tone="warning">{formatNumber(pending)} awaiting approval</Badge>
          ) : (
            <Badge tone="success">Nothing awaiting approval</Badge>
          )
        }
      />

      <Card
        title={admin.collegeName ? `${admin.collegeName} teachers` : "All teachers"}
        description="Approving an account makes it usable. Assigning a subject is what actually lets a teacher reach students."
        actions={
          <form action={BASE} className="flex items-center gap-2">
            <input type="hidden" name="status" value={status} />
            <label htmlFor="teacher-search" className="sr-only">
              Search teachers
            </label>
            <input
              id="teacher-search"
              name="q"
              defaultValue={search}
              placeholder="Name, email or employee ID"
              className="w-56 rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </form>
        }
      >
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5 px-4 pb-3">
          {TABS.map((tab) => {
            const active = tab.key === status;
            return (
              <a
                key={tab.key}
                href={`${BASE}?status=${tab.key}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium transition ${
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>

        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={params}
          rowCount={rows.length}
          empty={
            <EmptyState
              title={
                status === "pending"
                  ? "Nobody is waiting"
                  : search
                    ? "No teachers match that search"
                    : "No teachers yet"
              }
              description={
                status === "pending"
                  ? "Every teacher account has been dealt with."
                  : "Teachers sign up themselves and choose their college. They appear here for approval."
              }
            />
          }
        >
          {rows.map((row) => (
            <Row key={row.id} highlighted={row.status === "pending"}>
              <PrimaryCell title={row.name} subtitle={row.email} />
              <Cell secondary muted>
                {row.collegeName}
              </Cell>
              <Cell secondary muted>
                {row.departmentName ?? "—"}
              </Cell>
              <Cell numeric>{row.subjectCount}</Cell>
              <Cell>
                <span className="flex items-center gap-1.5">
                  <StatusBadge status={row.status} />
                  {!row.emailVerified && (
                    // Surfaced because it is the other half of the publish
                    // gate: an approved teacher with an unconfirmed address
                    // still cannot reach students, and an administrator
                    // wondering why needs to see it here.
                    <Badge tone="neutral">Email unconfirmed</Badge>
                  )}
                </span>
              </Cell>
              <Cell secondary muted nowrap>
                {formatRelative(new Date(row.createdAt))}
              </Cell>
              <Cell>
                <TeacherRowActions
                  teacherId={row.id}
                  status={row.status}
                  name={row.name}
                  canApprove={canApprove}
                  canAssign={canAssign}
                />
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      <p className="mt-5 text-[12.5px] leading-relaxed text-slate-400 dark:text-slate-500">
        Showing {formatNumber(rows.length)} of {formatNumber(total)}. A teacher is confined to the
        college they chose at sign-up and to the subjects assigned here — neither can be changed by
        the teacher.
      </p>
    </>
  );
}

function StatusBadge({ status }: { status: TeacherStatus }) {
  const tones: Record<TeacherStatus, BadgeTone> = {
    pending: "warning",
    active: "success",
    suspended: "danger",
    rejected: "neutral",
    deactivated: "neutral",
  };

  return <Badge tone={tones[status]}>{TEACHER_STATUS_LABELS[status]}</Badge>;
}
