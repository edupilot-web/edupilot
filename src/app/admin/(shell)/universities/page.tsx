import type { Metadata } from "next";
import { BuildingIcon } from "@/components/admin/icons";
import { Cell, Column, DataTable, PrimaryCell, Row, TableFooter } from "@/components/admin/data-table";
import { RecordStatusBadge, VerificationBadge } from "@/components/admin/status";
import { TableToolbar, type FilterGroup } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber, formatRelative } from "@/lib/admin/format";
import {
  MANAGEMENT_TYPES,
  UNIVERSITY_TYPES,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/admin/institution-fields";
import { activeFilterCount, readSort, type SearchParams } from "@/lib/admin/query";
import {
  UNIVERSITY_FILTER_KEYS,
  UNIVERSITY_SORT_FIELDS,
  getUniversityFacets,
  listUniversities,
} from "@/lib/admin/data/universities";

export const metadata: Metadata = { title: "Universities" };

const BASE = "/admin/universities";

const COLUMNS: Column[] = [
  { key: "name", label: "University", sortKey: "name" },
  { key: "type", label: "Type" },
  { key: "management", label: "Management", secondary: true },
  { key: "location", label: "Location", sortKey: "stateName" },
  { key: "established", label: "Est.", sortKey: "establishedYear", numeric: true, secondary: true },
  { key: "accreditation", label: "Accred.", secondary: true },
  { key: "colleges", label: "Colleges", sortKey: "collegeCount", numeric: true },
  { key: "verification", label: "Verification" },
  { key: "status", label: "Status", secondary: true },
  { key: "updated", label: "Updated", secondary: true },
];

export default async function UniversitiesPage(props: PageProps<"/admin/universities">) {
  await requirePermission("university.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const [{ rows, total, page, limit }, states] = await Promise.all([
    listUniversities(params),
    getUniversityFacets(),
  ]);

  const sort = readSort(params, UNIVERSITY_SORT_FIELDS, { field: "name", direction: 1 });
  const filtered = activeFilterCount(params, UNIVERSITY_FILTER_KEYS) > 0 || Boolean(params.q);

  const filters: FilterGroup[] = [
    {
      key: "state",
      label: "State",
      options: states.map((entry) => ({ value: entry.value, label: entry.label, count: entry.count })),
    },
    {
      key: "type",
      label: "Type",
      options: UNIVERSITY_TYPES.map((type) => ({ value: type, label: type.replace(" University", "") })),
    },
    {
      key: "management",
      label: "Management",
      options: MANAGEMENT_TYPES.slice(0, 6).map((type) => ({ value: type, label: type })),
    },
    {
      key: "verification",
      label: "Verification",
      options: VERIFICATION_STATUSES.map((status) => ({
        value: status,
        label: VERIFICATION_STATUS_LABELS[status],
      })),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Universities"
        description="Affiliating bodies. A college's relationship to one is a dated period, not a field — open a university to see what it affiliates today."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Universities" }]}
        meta={<Badge tone="neutral">{formatNumber(total)} {filtered ? "matching" : "total"}</Badge>}
      />

      <Card padded={false}>
        <TableToolbar
          basePath={BASE}
          params={params}
          searchPlaceholder="Search by name, code or city — try JNTU"
          filters={filters}
          filterKeys={UNIVERSITY_FILTER_KEYS}
        />

        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={params}
          sort={sort}
          rowCount={rows.length}
          empty={
            <EmptyState
              icon={<BuildingIcon className="h-5 w-5" />}
              title="No universities found"
              description={
                filtered
                  ? "Nothing matches the current search and filters."
                  : "No affiliating bodies have been added yet."
              }
              suggestions={
                filtered
                  ? ["Clear the state filter", "Search by short code — JNTUH, OU, SVU"]
                  : undefined
              }
            />
          }
        >
          {rows.map((row) => (
            <Row key={row.id}>
              <PrimaryCell
                href={`${BASE}/${row.id}`}
                title={row.name}
                subtitle={row.shortName ?? row.code ?? undefined}
              />
              <Cell muted nowrap>
                {row.type}
              </Cell>
              <Cell secondary muted nowrap>
                {row.managementType}
              </Cell>
              <Cell muted nowrap>
                {row.cityName ?? row.districtName ?? "—"}
                {row.stateName && (
                  <span className="ml-1 text-slate-400 dark:text-slate-600">· {row.stateName}</span>
                )}
              </Cell>
              <Cell secondary numeric muted>
                {row.establishedYear ?? "—"}
              </Cell>
              <Cell secondary muted>
                {row.accreditation ?? "—"}
              </Cell>
              <Cell numeric>
                {row.collegeCount > 0 ? (
                  <a
                    href={`/admin/colleges?university=${row.id}`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {formatNumber(row.collegeCount)}
                  </a>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">0</span>
                )}
              </Cell>
              <Cell nowrap>
                <VerificationBadge status={row.verificationStatus} />
              </Cell>
              <Cell secondary nowrap>
                <RecordStatusBadge status={row.status} />
              </Cell>
              <Cell secondary muted nowrap>
                {formatRelative(row.updatedAt)}
              </Cell>
            </Row>
          ))}
        </DataTable>

        <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
      </Card>
    </div>
  );
}
