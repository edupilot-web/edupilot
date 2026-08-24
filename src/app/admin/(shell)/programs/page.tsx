import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCapIcon } from "@/components/icons";
import { Cell, Column, DataTable, PrimaryCell, Row, TableFooter } from "@/components/admin/data-table";
import { RecordStatusBadge } from "@/components/admin/status";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import { PROGRAM_LEVELS } from "@/lib/admin/institution-fields";
import { DEGREES } from "@/lib/user-fields";
import type { SearchParams } from "@/lib/admin/query";
import { listPrograms } from "@/lib/admin/data/academic";

export const metadata: Metadata = { title: "Courses & programs" };

const BASE = "/admin/programs";

const COLUMNS: Column[] = [
  { key: "name", label: "Program" },
  { key: "college", label: "College" },
  { key: "degree", label: "Degree" },
  { key: "level", label: "Level", secondary: true },
  { key: "mode", label: "Mode", secondary: true },
  { key: "duration", label: "Years", numeric: true },
  { key: "intake", label: "Intake", numeric: true, secondary: true },
  { key: "status", label: "Status" },
];

/**
 * Programs offered (spec §16).
 *
 * Named `Program` in the code because `Course` is already the learning-content
 * model — a course made of lessons. The UI keeps the domain's word for it.
 */
export default async function ProgramsPage(props: PageProps<"/admin/programs">) {
  await requirePermission("academic.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const { rows, total, page, limit } = await listPrograms(params);

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Courses & programs"
        description="Degrees and specializations offered, with duration and sanctioned intake."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Courses / Programs" }]}
        meta={<Badge tone="neutral">{formatNumber(total)} total</Badge>}
      />

      <Card padded={false}>
        <TableToolbar
          basePath={BASE}
          params={params}
          searchPlaceholder="Search by program, degree, branch or college…"
          filters={[
            {
              key: "degree",
              label: "Degree",
              options: DEGREES.slice(0, 8).map((degree) => ({ value: degree, label: degree })),
            },
            {
              key: "level",
              label: "Level",
              options: PROGRAM_LEVELS.map((level) => ({ value: level, label: level })),
            },
          ]}
          filterKeys={["degree", "level", "college"]}
        />

        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={params}
          rowCount={rows.length}
          empty={
            <EmptyState
              icon={<GraduationCapIcon className="h-5 w-5" />}
              title="No programs found"
              description="Programs are recorded per college. Nothing matches the current search."
              suggestions={["Clear the degree filter", "Search by branch — try Computer Science"]}
            />
          }
        >
          {rows.map((row) => (
            <Row key={row.id}>
              <PrimaryCell title={row.name} subtitle={row.departmentName ?? undefined} />
              <Cell muted>
                <Link
                  href={`/admin/colleges/${row.collegeId}`}
                  className="hover:text-blue-700 hover:underline dark:hover:text-blue-400"
                >
                  {row.collegeName}
                </Link>
              </Cell>
              <Cell nowrap>
                <Badge tone="info" glyph={false}>
                  {row.degree}
                </Badge>
              </Cell>
              <Cell secondary muted nowrap>
                {row.level}
              </Cell>
              <Cell secondary muted nowrap>
                {row.mode}
              </Cell>
              <Cell numeric muted>
                {row.durationYears}
              </Cell>
              <Cell secondary numeric muted>
                {row.intake ? formatNumber(row.intake) : "—"}
              </Cell>
              <Cell nowrap>
                <RecordStatusBadge status={row.status} />
              </Cell>
            </Row>
          ))}
        </DataTable>

        <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
      </Card>

      <div className="mt-4">
        <InfoNote>
          A program&apos;s <strong>degree</strong> and <strong>specialization</strong> use the same
          vocabulary as a student&apos;s profile, so &ldquo;B.Tech in Computer Science and
          Engineering&rdquo; on a college and on a student are the same two values — which is what
          makes matching students to what their college actually offers possible later.
        </InfoNote>
      </div>
    </div>
  );
}
