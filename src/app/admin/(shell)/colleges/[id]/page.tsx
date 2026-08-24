import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildingIcon, LinkIcon, MapPinIcon, PencilIcon } from "@/components/admin/icons";
import { VerifyPanel } from "@/components/admin/verify-panel";
import { AutonomyBadge, RecordStatusBadge, VerificationBadge } from "@/components/admin/status";
import {
  Badge,
  BUTTON_STYLES,
  Card,
  Field,
  FieldGrid,
  InfoNote,
  PageHeader,
} from "@/components/admin/ui";
import { verifyCollegeAction } from "@/lib/admin/actions/colleges";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/admin/format";
import {
  AFFILIATION_TYPE_LABELS,
  type AffiliationType,
} from "@/lib/admin/institution-fields";
import { readParam, type SearchParams } from "@/lib/admin/query";
import { getCollegeDetail } from "@/lib/admin/data/colleges";

type Params = Promise<{ id: string }>;

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { id } = await props.params;
  const detail = await getCollegeDetail(id);
  return { title: detail?.doc.name ?? "College" };
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "affiliation", label: "Affiliation" },
  { key: "autonomy", label: "Autonomy" },
  { key: "academics", label: "Departments & programs" },
  { key: "history", label: "History" },
] as const;

/**
 * The college record (spec §7–§9).
 *
 * Tabs are querystring-driven rather than client state, so a colleague can be
 * sent straight to the affiliation timeline. It also means each tab's content
 * is server-rendered on demand instead of all five being shipped at once.
 */
export default async function CollegeDetailPage(props: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await props.params;
  const admin = await requirePermission("college.view", `/admin/colleges/${id}`);
  const params = await props.searchParams;

  const detail = await getCollegeDetail(id);
  if (!detail) notFound();

  const college = detail.doc;
  const tab = (TABS.find((entry) => entry.key === readParam(params, "tab"))?.key ??
    "overview") as (typeof TABS)[number]["key"];

  const justSaved = readParam(params, "saved") === "1";
  const justCreated = readParam(params, "created") === "1";

  const location = [college.cityName, college.districtName, college.stateName]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Colleges", href: "/admin/colleges" },
          { label: college.name },
        ]}
        title={college.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {college.code && (
              <span className="font-mono text-[12.5px] text-slate-500">{college.code}</span>
            )}
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />
                {location}
              </span>
            )}
            {college.website && (
              <a
                href={college.website}
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
            <VerificationBadge status={college.verificationStatus} />
            <AutonomyBadge status={college.autonomyStatus} />
            <RecordStatusBadge status={college.status} />
            {college.source === "student" && <Badge tone="purple">Student-entered</Badge>}
          </>
        }
        actions={
          can(admin, "college.edit") ? (
            <Link href={`/admin/colleges/${id}/edit`} className={BUTTON_STYLES.primary}>
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </Link>
          ) : undefined
        }
      />

      {(justSaved || justCreated) && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {justCreated ? "College created." : "Changes saved."} The change is recorded in the audit
          log.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <nav className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
            {TABS.map((entry) => {
              const active = entry.key === tab;
              return (
                <Link
                  key={entry.key}
                  href={
                    entry.key === "overview"
                      ? `/admin/colleges/${id}`
                      : `/admin/colleges/${id}?tab=${entry.key}`
                  }
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    active
                      ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {entry.label}
                  {entry.key === "affiliation" && detail.affiliations.length > 1 && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10.5px] tabular-nums text-slate-500 dark:bg-slate-800">
                      {detail.affiliations.length}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {tab === "overview" && (
            <div className="space-y-4">
              <Card title="Institution">
                <FieldGrid>
                  <Field label="Name" value={college.name} />
                  <Field label="Official name" value={college.officialName} />
                  <Field label="Short name" value={college.shortName} />
                  <Field label="College code" value={college.code} />
                  <Field label="Institution type" value={college.institutionType} />
                  <Field label="Management" value={college.managementType} />
                  <Field label="Established" value={college.establishedYear} />
                  <Field
                    label="Accreditation"
                    value={
                      college.accreditations?.length
                        ? college.accreditations
                            .map((entry) => `${entry.body} ${entry.grade ?? ""}`.trim())
                            .join(", ")
                        : null
                    }
                  />
                  <Field
                    label="Affiliating university"
                    value={college.universityName}
                    href={
                      college.universityId ? `/admin/universities/${college.universityId}` : undefined
                    }
                  />
                </FieldGrid>
              </Card>

              <Card title="Location">
                <FieldGrid>
                  <Field label="State" value={college.stateName} />
                  <Field label="District" value={college.districtName} />
                  <Field label="City" value={college.cityName} />
                  <Field label="Pincode" value={college.pincode} />
                  <Field label="Address" value={college.address} span />
                </FieldGrid>
              </Card>

              <Card title="Contact">
                <FieldGrid>
                  <Field label="Website" value={college.website} />
                  <Field label="Email" value={college.email} />
                  <Field label="Phone" value={college.phone} />
                </FieldGrid>
              </Card>

              {college.internalNotes && (
                <Card title="Internal notes" description="Visible to administrators only.">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {college.internalNotes}
                  </p>
                </Card>
              )}
            </div>
          )}

          {tab === "affiliation" && (
            <Card
              title="Affiliation history"
              description="Every period this college has been affiliated to a university."
              padded={false}
            >
              {detail.affiliations.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-slate-400">
                  No affiliation has been recorded. Set one from the edit screen.
                </p>
              ) : (
                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.affiliations.map((entry) => (
                    <li key={entry.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/universities/${entry.universityId}`}
                            className="text-[13.5px] font-medium text-slate-900 hover:underline dark:text-white"
                          >
                            {entry.universityName}
                          </Link>
                          <Badge tone={entry.status === "active" ? "success" : "neutral"}>
                            {entry.status === "active" ? "Current" : "Ended"}
                          </Badge>
                          <Badge tone="info" glyph={false}>
                            {AFFILIATION_TYPE_LABELS[entry.type as AffiliationType] ?? entry.type}
                          </Badge>
                        </div>
                        <span className="text-[12.5px] tabular-nums text-slate-500 dark:text-slate-400">
                          {formatDate(entry.startDate)} —{" "}
                          {entry.endDate ? formatDate(entry.endDate) : "present"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-slate-400 dark:text-slate-500">
                        {entry.referenceNumber && <span>Ref {entry.referenceNumber}</span>}
                        {entry.universityCode && <span>{entry.universityCode}</span>}
                        {entry.note && <span className="text-slate-500">{entry.note}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <InfoNote>
                  Changing the university on the edit screen closes the current period and opens a
                  new one. Past affiliations are never overwritten — a student who graduated under
                  the previous university still did.
                </InfoNote>
              </div>
            </Card>
          )}

          {tab === "autonomy" && (
            <Card
              title="Autonomy timeline"
              description="Grants, renewals and changes, with the authority behind each."
              padded={false}
            >
              {detail.autonomy.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-slate-400">
                  Nothing recorded. This college is marked{" "}
                  <strong className="font-medium text-slate-600 dark:text-slate-300">
                    non-autonomous
                  </strong>
                  .
                </p>
              ) : (
                <ol className="relative px-4 py-3">
                  {detail.autonomy.map((entry, index) => (
                    <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {/* The connecting rail, omitted on the last entry. */}
                      {index < detail.autonomy.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[5px] top-4 h-full w-px bg-slate-200 dark:bg-slate-700"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                          entry.event === "granted" || entry.event === "renewed"
                            ? "bg-emerald-500"
                            : entry.event === "revoked" || entry.event === "lapsed"
                              ? "bg-rose-500"
                              : "bg-slate-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-medium capitalize text-slate-900 dark:text-white">
                            {entry.event}
                          </span>
                          <span className="text-[12.5px] tabular-nums text-slate-500">
                            {formatDate(entry.validFrom ?? entry.createdAt)}
                            {entry.validUntil && ` — ${formatDate(entry.validUntil)}`}
                          </span>
                          <VerificationBadge status={entry.verificationStatus} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-4 text-[12px] text-slate-400 dark:text-slate-500">
                          {entry.approvalAuthority && <span>{entry.approvalAuthority}</span>}
                          {entry.approvalReference && <span>Ref {entry.approvalReference}</span>}
                        </div>
                        {entry.note && (
                          <p className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">
                            {entry.note}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}

          {tab === "academics" && (
            <div className="space-y-4">
              <Card
                title="Departments"
                description={`${detail.departments.length} recorded`}
                padded={false}
                actions={
                  <Link
                    href={`/admin/departments?college=${id}`}
                    className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Manage
                  </Link>
                }
              >
                {detail.departments.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[13px] text-slate-400">
                    No departments recorded for this college yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detail.departments.map((department) => (
                      <li
                        key={department.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                      >
                        <span className="text-[13px] text-slate-800 dark:text-slate-100">
                          {department.name}
                          {department.code && (
                            <span className="ml-2 font-mono text-[11.5px] text-slate-400">
                              {department.code}
                            </span>
                          )}
                        </span>
                        <span className="text-[12px] text-slate-400">
                          {department.hod ?? "No HOD recorded"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card
                title="Programs"
                description={`${detail.programs.length} recorded`}
                padded={false}
                actions={
                  <Link
                    href={`/admin/programs?college=${id}`}
                    className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Manage
                  </Link>
                }
              >
                {detail.programs.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[13px] text-slate-400">
                    No programs recorded for this college yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detail.programs.map((program) => (
                      <li
                        key={program.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                      >
                        <span className="text-[13px] text-slate-800 dark:text-slate-100">
                          {program.name}
                        </span>
                        <span className="text-[12px] tabular-nums text-slate-400">
                          {program.durationYears} yr
                          {program.intake ? ` · ${program.intake} seats` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {tab === "history" && (
            <Card
              title="Change history"
              description="Administrative actions recorded against this college."
              padded={false}
              actions={
                <Link
                  href={`/admin/audit?entityType=College&entityId=${id}`}
                  className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Full audit
                </Link>
              }
            >
              {detail.audit.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-slate-400">
                  Nothing has been recorded against this college yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.audit.map((entry) => (
                    <li key={entry.id} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[13px] text-slate-700 dark:text-slate-200">
                          <span className="font-medium">{entry.actor}</span>{" "}
                          <span className="text-slate-500 dark:text-slate-400">{entry.action}</span>
                        </span>
                        <span
                          className="shrink-0 text-[11.5px] text-slate-400"
                          title={formatDateTime(entry.at)}
                        >
                          {formatRelative(entry.at)}
                        </span>
                      </div>
                      {entry.after && Object.keys(entry.after).length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {Object.entries(entry.after).map(([field, value]) => (
                            <li key={field} className="text-[12px] text-slate-500 dark:text-slate-400">
                              <span className="font-mono text-slate-400">{field}</span>{" "}
                              <span className="text-rose-600 line-through dark:text-rose-400">
                                {renderValue(entry.before?.[field])}
                              </span>{" "}
                              <span aria-hidden="true">→</span>{" "}
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {renderValue(value)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar: the decisions and the numbers, always visible. */}
        <aside className="space-y-4">
          {can(admin, "college.verify") && (
            <VerifyPanel
              id={id}
              status={college.verificationStatus}
              note={college.verificationNote ?? null}
              verifiedAt={college.verifiedAt ? formatDate(college.verifiedAt) : null}
              action={verifyCollegeAction}
            />
          )}

          <Card title="At a glance">
            <dl className="space-y-2.5">
              <Stat label="Students" value={formatNumber(detail.studentCount)} />
              <Stat label="Departments" value={formatNumber(detail.departments.length)} />
              <Stat label="Programs" value={formatNumber(detail.programs.length)} />
              <Stat label="Affiliation periods" value={formatNumber(detail.affiliations.length)} />
              <Stat label="Autonomy records" value={formatNumber(detail.autonomy.length)} />
            </dl>
          </Card>

          <Card title="Record">
            <dl className="space-y-2.5">
              <Stat label="Source" value={<span className="capitalize">{college.source}</span>} />
              <Stat label="Created" value={formatDate(college.createdAt)} />
              <Stat label="Updated" value={formatRelative(college.updatedAt)} />
              {college.sourceImportId && (
                <Stat
                  label="Imported by"
                  value={
                    <Link
                      href={`/admin/imports/${college.sourceImportId}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      View import
                    </Link>
                  }
                />
              )}
            </dl>
          </Card>

          <Card title="Related">
            <ul className="space-y-1.5 text-[12.5px]">
              <li>
                <Link
                  href={`/admin/students?college=${id}`}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:underline dark:text-blue-400"
                >
                  <BuildingIcon className="h-3.5 w-3.5" />
                  Students at this college
                </Link>
              </li>
              <li>
                <Link
                  href={`/admin/affiliations?college=${id}`}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:underline dark:text-blue-400"
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Affiliation records
                </Link>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-[13px] font-medium tabular-nums text-slate-800 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}

/** Renders an audit value; `null` and `undefined` both read as "empty". */
function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
