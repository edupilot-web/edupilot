import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "@/components/admin/icons";
import { Cell, Column, DataTable, PrimaryCell, Row, TableFooter } from "@/components/admin/data-table";
import { VerificationBadge } from "@/components/admin/status";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatDate, formatNumber } from "@/lib/admin/format";
import {
  AFFILIATION_STATUSES,
  AFFILIATION_TYPES,
  AFFILIATION_TYPE_LABELS,
  type AffiliationType,
} from "@/lib/admin/institution-fields";
import type { SearchParams } from "@/lib/admin/query";
import { listAffiliations } from "@/lib/admin/data/academic";

export const metadata: Metadata = { title: "Affiliations" };

const BASE = "/admin/affiliations";

const COLUMNS: Column[] = [
  { key: "college", label: "College" },
  { key: "university", label: "University" },
  { key: "type", label: "Type" },
  { key: "period", label: "Period" },
  { key: "reference", label: "Reference", secondary: true },
  { key: "verification", label: "Verification", secondary: true },
  { key: "status", label: "Status" },
];

/**
 * Every college–university relationship, including the ones that have ended
 * (spec §8).
 *
 * The screen that makes the point of the model visible: a college that moved
 * from one university to another has two rows here, and the student who
 * graduated under the first one still graduated under the first one.
 */
export default async function AffiliationsPage(props: PageProps<"/admin/affiliations">) {
  await requirePermission("college.view", BASE);
  const params = (await props.searchParams) as SearchParams;

  const { rows, total, page, limit } = await listAffiliations(params);

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Affiliations"
        description="Every college–university relationship as a dated period — current and historical."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Affiliations" }]}
        meta={<Badge tone="neutral">{formatNumber(total)} periods</Badge>}
      />

      <Card padded={false}>
        <TableToolbar
          basePath={BASE}
          params={params}
          searchPlaceholder="Search by college, university or reference number…"
          filters={[
            {
              key: "status",
              label: "Status",
              options: AFFILIATION_STATUSES.map((status) => ({
                value: status,
                label: status.charAt(0).toUpperCase() + status.slice(1),
              })),
            },
            {
              key: "type",
              label: "Type",
              options: AFFILIATION_TYPES.map((type) => ({
                value: type,
                label: AFFILIATION_TYPE_LABELS[type],
              })),
            },
          ]}
          filterKeys={["status", "type", "college", "university"]}
        />

        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={params}
          rowCount={rows.length}
          empty={
            <EmptyState
              icon={<LinkIcon className="h-5 w-5" />}
              title="No affiliation records"
              description="A period is written whenever a college's affiliating university is set or changed."
            />
          }
        >
          {rows.map((row) => (
            <Row key={row.id}>
              <PrimaryCell href={`/admin/colleges/${row.collegeId}`} title={row.collegeName} />
              <Cell muted>
                <Link
                  href={`/admin/universities/${row.universityId}`}
                  className="hover:text-blue-700 hover:underline dark:hover:text-blue-400"
                >
                  {row.universityName}
                </Link>
                {row.universityCode && (
                  <span className="ml-1.5 font-mono text-[11px] text-slate-400">
                    {row.universityCode}
                  </span>
                )}
              </Cell>
              <Cell nowrap>
                <Badge tone="info" glyph={false}>
                  {AFFILIATION_TYPE_LABELS[row.type as AffiliationType] ?? row.type}
                </Badge>
              </Cell>
              <Cell muted nowrap>
                {formatDate(row.startDate)} — {row.endDate ? formatDate(row.endDate) : "present"}
              </Cell>
              <Cell secondary muted nowrap>
                {row.referenceNumber ?? "—"}
              </Cell>
              <Cell secondary nowrap>
                <VerificationBadge status={row.verificationStatus} />
              </Cell>
              <Cell nowrap>
                <Badge tone={row.status === "active" ? "success" : "neutral"}>
                  {row.status === "active" ? "Current" : "Ended"}
                </Badge>
              </Cell>
            </Row>
          ))}
        </DataTable>

        <TableFooter basePath={BASE} params={params} page={page} limit={limit} total={total} />
      </Card>

      <div className="mt-4">
        <InfoNote>
          Changing a college&apos;s university on its edit screen closes the current period and
          opens a new one — it never overwrites the old row. Exactly one period per college should
          be <strong>Current</strong>; the Data Quality screen flags any college where more than one
          is.
        </InfoNote>
      </div>
    </div>
  );
}
