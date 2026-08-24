import type { Metadata } from "next";
import Link from "next/link";
import { UsersIcon } from "@/components/icons";
import { BulkBar } from "@/components/admin/bulk-bar";
import {
  Cell,
  Column,
  DataTable,
  PrimaryCell,
  Row,
  SelectCell,
  TableFooter,
} from "@/components/admin/data-table";
import { RowCheckbox, SelectionScope } from "@/components/admin/selection";
import { TableToolbar, type FilterGroup } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { bulkStudentAction } from "@/lib/admin/actions/students";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatNumber, formatRelative } from "@/lib/admin/format";
import { activeFilterCount, readSort, type SearchParams } from "@/lib/admin/query";
import {
  STUDENT_FILTER_KEYS,
  STUDENT_SORT_FIELDS,
  getStudentFacets,
  listStudents,
} from "@/lib/admin/data/students";
import { getStates } from "@/lib/admin/data/dashboard";

export const metadata: Metadata = { title: "Students" };

const BASE = "/admin/students";

const COLUMNS: Column[] = [
  { key: "name", label: "Student", sortKey: "name" },
  { key: "college", label: "College" },
  { key: "course", label: "Course", secondary: true },
  { key: "year", label: "Year", numeric: true },
  { key: "graduation", label: "Graduating", numeric: true, secondary: true },
  { key: "profile", label: "Profile" },
  { key: "verification", label: "Email" },
  { key: "provider", label: "Sign-in", secondary: true },
  { key: "registered", label: "Registered", sortKey: "createdAt", secondary: true },
  { key: "active", label: "Last active", sortKey: "updatedAt" },
];

/**
 * The student directory (spec §17).
 *
 * Contact details are masked for anyone without `student.view_pii`, and the
 * masking happens in the data layer rather than here — a permission enforced
 * only in the markup is one new table away from leaking.
 */
export default async function StudentsPage(props: PageProps<"/admin/students">) {
  const admin = await requirePermission("student.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const canSeePii = can(admin, "student.view_pii");

  const [{ rows, total, page, limit }, facets, states] = await Promise.all([
    listStudents(params, canSeePii),
    getStudentFacets(),
    getStates(),
  ]);

  const sort = readSort(params, STUDENT_SORT_FIELDS, { field: "createdAt", direction: -1 });
  const filtered = activeFilterCount(params, STUDENT_FILTER_KEYS) > 0 || Boolean(params.q);

  const filters: FilterGroup[] = [
    {
      key: "profile",
      label: "Profile",
      single: true,
      options: [
        { value: "complete", label: "Complete", count: facets.complete },
        { value: "incomplete", label: "Incomplete", count: facets.incomplete },
      ],
    },
    {
      key: "verification",
      label: "Email",
      single: true,
      options: [
        { value: "verified", label: "Verified", count: facets.verified },
        { value: "unverified", label: "Unverified", count: facets.unverified },
      ],
    },
    {
      key: "provider",
      label: "Sign-in",
      options: [
        { value: "email", label: "Email" },
        { value: "google", label: "Google", count: facets.google },
      ],
    },
    {
      key: "state",
      label: "State",
      options: states.slice(0, 6).map((state) => ({ value: state.name, label: state.name })),
    },
    {
      key: "year",
      label: "Year",
      options: [1, 2, 3, 4, 5].map((year) => ({ value: String(year), label: `${year}` })),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Students"
        description="Every registered account, its academic profile and how far through onboarding it is."
        breadcrumbs={[{ label: "Student Management" }, { label: "Students" }]}
        meta={
          <Badge tone="neutral">
            {formatNumber(total)} {filtered ? "matching" : "total"}
          </Badge>
        }
      />

      {!canSeePii && (
        <div className="mb-4">
          <InfoNote>
            Email addresses and phone numbers are masked. Seeing them needs the{" "}
            <strong>View contact details</strong> permission — ask a Super Admin if your work
            requires it.
          </InfoNote>
        </div>
      )}

      <SelectionScope pageIds={rows.map((row) => row.id)}>
        <Card padded={false}>
          <TableToolbar
            basePath={BASE}
            params={params}
            searchPlaceholder={
              canSeePii ? "Search by name, email or phone…" : "Search by name or email…"
            }
            filters={filters}
            filterKeys={STUDENT_FILTER_KEYS}
          />

          <DataTable
            columns={COLUMNS}
            selectable={can(admin, "student.verify")}
            basePath={BASE}
            params={params}
            sort={sort}
            rowCount={rows.length}
            empty={
              <EmptyState
                icon={<UsersIcon className="h-5 w-5" />}
                title="No students found"
                description={
                  filtered
                    ? "Nothing matches the current search and filters."
                    : "No student accounts have been created yet."
                }
                suggestions={
                  filtered
                    ? [
                        "Clear the profile or email filter",
                        "The state filter matches the student's college, not their address",
                        "Search by the full email address",
                      ]
                    : undefined
                }
              />
            }
          >
            {rows.map((row) => (
              <Row key={row.id} highlighted={!row.emailVerified}>
                {can(admin, "student.verify") && (
                  <SelectCell>
                    <RowCheckbox id={row.id} label={row.name} />
                  </SelectCell>
                )}

                <PrimaryCell
                  href={`${BASE}/${row.id}`}
                  title={row.name}
                  subtitle={row.email}
                />

                <Cell muted>
                  {row.collegeId ? (
                    <Link
                      href={`/admin/colleges/${row.collegeId}`}
                      className="hover:text-blue-700 hover:underline dark:hover:text-blue-400"
                    >
                      {row.collegeName}
                    </Link>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">Not selected</span>
                  )}
                </Cell>

                <Cell secondary muted>
                  {row.degree ? (
                    <>
                      {row.degree}
                      {row.specialization && (
                        <span className="ml-1 text-slate-400 dark:text-slate-600">
                          · {row.specialization}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </Cell>

                <Cell numeric muted>
                  {row.currentYear ?? "—"}
                </Cell>
                <Cell secondary numeric muted>
                  {row.graduationYear ?? "—"}
                </Cell>

                <Cell nowrap>
                  {row.profileCompleted ? (
                    <Badge tone="success">Complete</Badge>
                  ) : (
                    <Badge tone="warning">Incomplete</Badge>
                  )}
                </Cell>

                <Cell nowrap>
                  {row.emailVerified ? (
                    <Badge tone="success">Verified</Badge>
                  ) : (
                    <Badge tone="danger">Unverified</Badge>
                  )}
                </Cell>

                <Cell secondary muted nowrap>
                  <span className="capitalize">{row.authProvider}</span>
                </Cell>

                <Cell secondary muted nowrap>
                  {formatRelative(row.createdAt)}
                </Cell>
                <Cell muted nowrap>
                  {formatRelative(row.lastActiveAt)}
                </Cell>
              </Row>
            ))}
          </DataTable>

          <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
        </Card>

        {can(admin, "student.verify") && (
          <BulkBar
            action={bulkStudentAction}
            entityLabel="student"
            entityLabelPlural="students"
            actions={[
              { key: "verify", label: "Mark verified" },
              {
                key: "unverify",
                label: "Mark unverified",
                destructive: true,
                confirmBody:
                  "Those students will be sent back to the verification screen the next time they sign in, and cannot use the platform until they confirm their address again.",
              },
            ]}
          />
        )}
      </SelectionScope>
    </div>
  );
}
