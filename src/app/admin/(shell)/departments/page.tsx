import type { Metadata } from "next";
import Link from "next/link";
import { BookIcon } from "@/components/icons";
import { Cell, Column, DataTable, PrimaryCell, Row, TableFooter } from "@/components/admin/data-table";
import { RecordStatusBadge } from "@/components/admin/status";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { getDepartmentVariants, listDepartments } from "@/lib/admin/data/academic";

export const metadata: Metadata = { title: "Departments" };

const BASE = "/admin/departments";

const COLUMNS: Column[] = [
  { key: "name", label: "Department" },
  { key: "college", label: "College" },
  { key: "hod", label: "Head of department", secondary: true },
  { key: "programs", label: "Programs", numeric: true },
  { key: "students", label: "Students", numeric: true, secondary: true },
  { key: "status", label: "Status" },
];

export default async function DepartmentsPage(props: PageProps<"/admin/departments">) {
  await requirePermission("academic.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const [{ rows, total, page, limit }, variants] = await Promise.all([
    listDepartments(params),
    getDepartmentVariants(),
  ]);

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Departments"
        description="Departments across every college, and the canonical branch each maps to."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Departments" }]}
        meta={<Badge tone="neutral">{formatNumber(total)} total</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Card padded={false}>
            <TableToolbar
              basePath={BASE}
              params={params}
              searchPlaceholder="Search by department, college or HOD…"
              filters={[
                {
                  key: "status",
                  label: "Status",
                  options: [
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ],
                },
              ]}
              filterKeys={["status", "college"]}
            />

            <DataTable
              columns={COLUMNS}
              basePath={BASE}
              params={params}
              rowCount={rows.length}
              empty={
                <EmptyState
                  icon={<BookIcon className="h-5 w-5" />}
                  title="No departments found"
                  description="Departments are recorded per college. Add them from a college's page, or import them."
                />
              }
            >
              {rows.map((row) => (
                <Row key={row.id}>
                  <PrimaryCell title={row.name} subtitle={row.code ?? undefined} />
                  <Cell muted>
                    <Link
                      href={`/admin/colleges/${row.collegeId}`}
                      className="hover:text-blue-700 hover:underline dark:hover:text-blue-400"
                    >
                      {row.collegeName}
                    </Link>
                  </Cell>
                  <Cell secondary muted>
                    {row.hod ?? "—"}
                  </Cell>
                  <Cell numeric muted>
                    {formatNumber(row.programCount)}
                  </Cell>
                  <Cell secondary numeric muted>
                    {formatNumber(row.studentCount)}
                  </Cell>
                  <Cell nowrap>
                    <RecordStatusBadge status={row.status} />
                  </Cell>
                </Row>
              ))}
            </DataTable>

            <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card
            title="Name variants"
            description="Departments that mean the same thing but are spelled differently."
            padded={false}
          >
            {variants.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-slate-400">
                No variants found — every department maps cleanly.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {variants.map((variant) => (
                  <li key={variant.key} className="px-4 py-2.5">
                    <p className="font-mono text-[11px] text-slate-400">{variant.key}</p>
                    <ul className="mt-1 space-y-0.5">
                      {variant.names.map((name) => (
                        <li key={name} className="text-[12.5px] text-slate-700 dark:text-slate-200">
                          · {name}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[11.5px] text-slate-400">
                      {variant.count} departments across colleges
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <InfoNote>
            Every department carries a canonical key derived from its name — lower-cased, filler
            words dropped — so &ldquo;CSE&rdquo; and &ldquo;Computer Science &amp; Engg.&rdquo; can
            be counted together. Without it, &ldquo;students by branch&rdquo; is unanswerable across
            colleges.
          </InfoNote>
        </aside>
      </div>
    </div>
  );
}
