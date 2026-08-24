import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList, ChartFrame, DonutChart } from "@/components/admin/charts";
import { LinkIcon, MapPinIcon } from "@/components/admin/icons";
import { AutonomyBadge, RecordStatusBadge, VerificationBadge } from "@/components/admin/status";
import { Badge, BUTTON_STYLES, Card, Field, FieldGrid, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatDate, formatNumber, formatRelative } from "@/lib/admin/format";
import { AUTONOMY_STATUS_LABELS, type AutonomyStatus } from "@/lib/admin/institution-fields";
import { getUniversityDetail } from "@/lib/admin/data/universities";

type Params = Promise<{ id: string }>;

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { id } = await props.params;
  const detail = await getUniversityDetail(id);
  return { title: detail?.doc.name ?? "University" };
}

export default async function UniversityDetailPage(props: { params: Params }) {
  const { id } = await props.params;
  await requirePermission("university.view", `/admin/universities/${id}`);

  const detail = await getUniversityDetail(id);
  if (!detail) notFound();

  const university = detail.doc;
  const location = [university.cityName, university.districtName, university.stateName]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Universities", href: "/admin/universities" },
          { label: university.name },
        ]}
        title={university.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {university.code && (
              <span className="font-mono text-[12.5px] text-slate-500">{university.code}</span>
            )}
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />
                {location}
              </span>
            )}
            {university.website && (
              <a
                href={university.website}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Website
              </a>
            )}
          </span>
        }
        meta={
          <>
            <Badge tone="info">{university.type}</Badge>
            <VerificationBadge status={university.verificationStatus} />
            <RecordStatusBadge status={university.status} />
          </>
        }
        actions={
          <Link href={`/admin/colleges?university=${id}`} className={BUTTON_STYLES.secondary}>
            View all {formatNumber(detail.collegeCount)} colleges
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Card title="Institution">
            <FieldGrid>
              <Field label="Name" value={university.name} />
              <Field label="Short name" value={university.shortName} />
              <Field label="Code" value={university.code} />
              <Field label="Type" value={university.type} />
              <Field label="Management" value={university.managementType} />
              <Field label="Established" value={university.establishedYear} />
              <Field
                label="Accreditation"
                value={
                  university.accreditations?.length
                    ? university.accreditations
                        .map((entry) => `${entry.body} ${entry.grade ?? ""}`.trim())
                        .join(", ")
                    : null
                }
              />
              <Field label="Email" value={university.email} />
              <Field label="Phone" value={university.phone} />
              <Field
                label="Recognitions"
                value={university.recognitions?.length ? university.recognitions.join(" · ") : null}
                span
              />
              <Field label="Address" value={university.address} span />
            </FieldGrid>
          </Card>

          <Card
            title="Affiliated colleges"
            description={`${formatNumber(detail.collegeCount)} active. The 25 largest are shown.`}
            padded={false}
            actions={
              <Link
                href={`/admin/colleges?university=${id}`}
                className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Open in the college table
              </Link>
            }
          >
            {detail.colleges.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-slate-400">
                No colleges are currently affiliated to this university.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {detail.colleges.map((college) => (
                  <li
                    key={college.id}
                    className="flex flex-wrap items-center gap-2 px-4 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <Link
                      href={`/admin/colleges/${college.id}`}
                      className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 hover:underline dark:text-slate-100"
                    >
                      {college.name}
                    </Link>
                    <span className="shrink-0 text-[12px] text-slate-400">
                      {college.districtName ?? "—"}
                    </span>
                    <AutonomyBadge status={college.autonomyStatus} />
                    <VerificationBadge status={college.verificationStatus} />
                    <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-slate-500">
                      {formatNumber(college.studentCount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <ChartFrame title="Autonomy mix" subtitle="Across affiliated colleges">
                <DonutChart
                  points={detail.byAutonomy.map((entry) => ({
                    label: AUTONOMY_STATUS_LABELS[entry.label as AutonomyStatus] ?? entry.label,
                    value: entry.value,
                  }))}
                />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame title="Top districts" subtitle="Where its colleges are">
                <BarList
                  points={detail.byDistrict}
                  href={(point) =>
                    `/admin/colleges?university=${id}&district=${encodeURIComponent(point.label)}`
                  }
                />
              </ChartFrame>
            </Card>
          </div>
        </div>

        <aside className="space-y-4">
          <Card title="At a glance">
            <dl className="space-y-2.5">
              <Row label="Affiliated colleges" value={formatNumber(detail.collegeCount)} />
              <Row
                label="Past affiliations"
                value={formatNumber(detail.historicalAffiliations)}
                hint="Colleges that have since moved elsewhere"
              />
              <Row label="Created" value={formatDate(university.createdAt)} />
              <Row label="Updated" value={formatRelative(university.updatedAt)} />
            </dl>
          </Card>

          <Card title="Verification">
            <div className="flex items-center justify-between gap-2">
              <VerificationBadge status={university.verificationStatus} />
              {university.verifiedAt && (
                <span className="text-[11.5px] text-slate-400">
                  {formatDate(university.verifiedAt)}
                </span>
              )}
            </div>
            {university.verificationNote && (
              <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {university.verificationNote}
              </p>
            )}
          </Card>

          {detail.audit.length > 0 && (
            <Card title="Recent changes" padded={false}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {detail.audit.map((entry) => (
                  <li key={entry.id} className="px-4 py-2 text-[12.5px]">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {entry.actor}
                    </span>{" "}
                    <span className="text-slate-500 dark:text-slate-400">{entry.action}</span>
                    <span className="ml-1 text-slate-400">· {formatRelative(entry.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-slate-500 dark:text-slate-400">
        {label}
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </dt>
      <dd className="shrink-0 text-[13px] font-medium tabular-nums text-slate-800 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}
