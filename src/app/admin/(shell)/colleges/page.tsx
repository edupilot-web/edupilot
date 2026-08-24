import type { Metadata } from "next";
import Link from "next/link";
import { BuildingIcon, DownloadIcon, UploadIcon } from "@/components/admin/icons";
import { PlusIcon } from "@/components/icons";
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
import { AutonomyBadge, RecordStatusBadge, VerificationBadge } from "@/components/admin/status";
import { TableToolbar, type FilterGroup } from "@/components/admin/table-toolbar";
import { Badge, BUTTON_STYLES, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { bulkCollegeAction } from "@/lib/admin/actions/colleges";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatNumber, formatRelative } from "@/lib/admin/format";
import {
  AUTONOMY_STATUSES,
  AUTONOMY_STATUS_LABELS,
  INSTITUTION_TYPES,
  MANAGEMENT_TYPES,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/admin/institution-fields";
import { activeFilterCount, buildHref, readSort, type SearchParams } from "@/lib/admin/query";
import {
  COLLEGE_FILTER_KEYS,
  COLLEGE_SORT_FIELDS,
  getCollegeFacets,
  listColleges,
} from "@/lib/admin/data/colleges";

export const metadata: Metadata = { title: "Colleges" };

const BASE = "/admin/colleges";

const COLUMNS: Column[] = [
  { key: "name", label: "College", sortKey: "name" },
  { key: "type", label: "Type", secondary: true },
  { key: "autonomy", label: "Autonomy" },
  { key: "university", label: "Affiliated to" },
  { key: "location", label: "Location", sortKey: "stateName" },
  { key: "accreditation", label: "Accred.", secondary: true },
  { key: "verification", label: "Verification", sortKey: "verificationStatus" },
  { key: "students", label: "Students", sortKey: "studentCount", numeric: true },
  { key: "status", label: "Status", secondary: true },
  { key: "updated", label: "Updated", sortKey: "updatedAt", secondary: true },
];

/**
 * The college directory (spec §4–§6).
 *
 * Everything — search, filters, sort, page size — is in the URL, so the view an
 * operator is looking at is a link they can send to a colleague, save as a view,
 * or hand to the exporter to get exactly those rows.
 */
export default async function CollegesPage(props: PageProps<"/admin/colleges">) {
  const admin = await requirePermission("college.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const [{ rows, total, page, limit }, facets] = await Promise.all([
    listColleges(params),
    getCollegeFacets(params),
  ]);

  const sort = readSort(params, COLLEGE_SORT_FIELDS, { field: "name", direction: 1 });
  const filterCount = activeFilterCount(params, COLLEGE_FILTER_KEYS);
  const currentQuery = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((v) => [key, v] as [string, string])
    )
  ).toString();

  const filters: FilterGroup[] = [
    {
      key: "verification",
      label: "Verification",
      options: VERIFICATION_STATUSES.map((status) => ({
        value: status,
        label: VERIFICATION_STATUS_LABELS[status],
      })),
    },
    {
      key: "state",
      label: "State",
      options: facets.states.map((state) => ({
        value: state.value,
        label: state.label,
        count: state.count,
      })),
    },
    ...(facets.districts.length
      ? [
          {
            key: "district",
            label: "District",
            options: facets.districts.slice(0, 14).map((district) => ({
              value: district.value,
              label: district.label,
              count: district.count,
            })),
          },
        ]
      : []),
    {
      key: "autonomy",
      label: "Autonomy",
      options: AUTONOMY_STATUSES.map((status) => ({
        value: status,
        label: AUTONOMY_STATUS_LABELS[status],
      })),
    },
    {
      key: "management",
      label: "Management",
      options: MANAGEMENT_TYPES.slice(0, 6).map((type) => ({ value: type, label: type })),
    },
    {
      key: "type",
      label: "Institution",
      options: INSTITUTION_TYPES.slice(0, 5).map((type) => ({ value: type, label: type })),
    },
    {
      key: "source",
      label: "Source",
      options: [
        { value: "admin", label: "Added by admin" },
        { value: "import", label: "Imported" },
        { value: "student", label: "Student-entered" },
        { value: "seed", label: "Seeded" },
      ],
    },
  ];

  const savedViews = [
    { id: "pending-ap", name: "Pending AP colleges", query: "state=Andhra+Pradesh&verification=pending", system: true },
    { id: "ts-autonomous", name: "Telangana autonomous", query: "state=Telangana&autonomy=autonomous", system: true },
    { id: "unverified", name: "Unverified", query: "verification=not-verified", system: true },
    { id: "student-added", name: "Student-added", query: "source=student", system: true },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Colleges"
        description="The institution directory students pick from during onboarding. Search, filter, verify and bulk-edit."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Colleges" }]}
        meta={
          <Badge tone="neutral">{formatNumber(total)} {filterCount > 0 || params.q ? "matching" : "total"}</Badge>
        }
        actions={
          <>
            {can(admin, "college.export") && (
              <Link
                href={buildHref("/admin/exports/new", params, {})}
                className={BUTTON_STYLES.secondary}
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Export
              </Link>
            )}
            {can(admin, "college.import") && (
              <Link href="/admin/imports/new" className={BUTTON_STYLES.secondary}>
                <UploadIcon className="h-3.5 w-3.5" />
                Import
              </Link>
            )}
            {can(admin, "college.create") && (
              <Link href="/admin/colleges/new" className={BUTTON_STYLES.primary}>
                <PlusIcon className="h-3.5 w-3.5" />
                Add college
              </Link>
            )}
          </>
        }
      />

      <SelectionScope pageIds={rows.map((row) => row.id)}>
        <Card padded={false}>
          <TableToolbar
            basePath={BASE}
            params={params}
            searchPlaceholder="Search by name, code, university, city or pincode…"
            filters={filters}
            filterKeys={COLLEGE_FILTER_KEYS}
            savedViews={
              <div className="flex flex-wrap items-center gap-1.5">
                {savedViews.map((view) => {
                  const active = view.query === currentQuery;
                  return (
                    <Link
                      key={view.id}
                      href={`${BASE}?${view.query}`}
                      aria-current={active ? "true" : undefined}
                      className={`rounded-md px-2 py-1 text-[12px] font-medium ring-1 ring-inset transition ${
                        active
                          ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                      }`}
                    >
                      {view.name}
                    </Link>
                  );
                })}
              </div>
            }
          />

          <DataTable
            columns={COLUMNS}
            selectable={can(admin, "college.edit")}
            basePath={BASE}
            params={params}
            sort={sort}
            rowCount={rows.length}
            empty={
              <EmptyState
                icon={<BuildingIcon className="h-5 w-5" />}
                title="No colleges found"
                description={
                  filterCount > 0 || params.q
                    ? "Nothing matches the current search and filters."
                    : "The directory is empty. Import a spreadsheet or add the first college by hand."
                }
                suggestions={
                  filterCount > 0 || params.q
                    ? [
                        "Remove one of the filters above",
                        "Search by college code or city instead of name",
                        "Check the state filter — districts are scoped to it",
                      ]
                    : undefined
                }
                action={
                  can(admin, "college.import") ? (
                    <Link href="/admin/imports/new" className={BUTTON_STYLES.primary}>
                      <UploadIcon className="h-3.5 w-3.5" />
                      Import colleges
                    </Link>
                  ) : undefined
                }
              />
            }
          >
            {rows.map((row) => (
              <Row key={row.id} highlighted={row.verificationStatus === "pending"}>
                {can(admin, "college.edit") && (
                  <SelectCell>
                    <RowCheckbox id={row.id} label={row.name} />
                  </SelectCell>
                )}

                <PrimaryCell
                  href={`${BASE}/${row.id}`}
                  title={row.name}
                  subtitle={row.code ?? undefined}
                  badge={
                    row.source === "student" ? (
                      <Badge tone="purple" glyph={false}>
                        student
                      </Badge>
                    ) : undefined
                  }
                />

                <Cell secondary muted nowrap>
                  {row.institutionType}
                </Cell>
                <Cell nowrap>
                  <AutonomyBadge status={row.autonomyStatus} />
                </Cell>
                <Cell muted>
                  {row.universityId ? (
                    <Link
                      href={`/admin/universities/${row.universityId}`}
                      className="rounded transition hover:text-blue-700 hover:underline dark:hover:text-blue-400"
                    >
                      {row.universityName}
                    </Link>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Not set</span>
                  )}
                </Cell>
                <Cell muted nowrap>
                  {row.districtName ?? row.cityName ?? "—"}
                  {row.stateName && (
                    <span className="ml-1 text-slate-400 dark:text-slate-600">· {row.stateName}</span>
                  )}
                </Cell>
                <Cell secondary muted nowrap>
                  {row.accreditation ?? "—"}
                </Cell>
                <Cell nowrap>
                  <VerificationBadge status={row.verificationStatus} />
                </Cell>
                <Cell numeric muted>
                  {formatNumber(row.studentCount)}
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

        {can(admin, "college.edit") && (
          <BulkBar
            action={bulkCollegeAction}
            entityLabel="college"
            entityLabelPlural="colleges"
            actions={[
              ...(can(admin, "college.verify")
                ? [
                    { key: "verify", label: "Verify" },
                    { key: "reject", label: "Reject" },
                  ]
                : []),
              { key: "activate", label: "Activate" },
              { key: "deactivate", label: "Deactivate" },
              ...(can(admin, "college.delete")
                ? [
                    {
                      key: "archive",
                      label: "Archive",
                      destructive: true,
                      requiresTypedCount: true,
                      confirmBody:
                        "Archived colleges stop appearing to students and in the default admin view. Existing student profiles keep pointing at them, so nothing is lost — but the change is recorded against every row.",
                    },
                  ]
                : []),
            ]}
          />
        )}
      </SelectionScope>
    </div>
  );
}
