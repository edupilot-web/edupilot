import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseIcon, SparkIcon } from "@/components/admin/icons";
import { VerificationBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import { findDuplicateColleges, getQualityChecks } from "@/lib/admin/data/data-quality";

export const metadata: Metadata = { title: "Data quality" };

const SEVERITY = {
  high: { tone: "danger" as const, label: "High" },
  medium: { tone: "warning" as const, label: "Medium" },
  low: { tone: "neutral" as const, label: "Low" },
};

/**
 * The data-quality queue (spec §34).
 *
 * A work list, not a score. Each row names the problem, what it costs, how many
 * records it affects and where to go to fix it — a percentage on a dial would
 * tell an operator nothing they can act on.
 */
export default async function DataQualityPage() {
  await requirePermission("college.view", "/admin/data-quality");

  const [checks, duplicates] = await Promise.all([getQualityChecks(), findDuplicateColleges()]);

  const high = checks.filter((check) => check.severity === "high");
  const affected = checks.reduce((sum, check) => sum + check.count, 0);

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Data quality"
        description="Gaps, conflicts and near-duplicates in the institution data, ranked by what they actually break."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Data Quality" }]}
        meta={
          high.length > 0 ? (
            <Badge tone="danger">{high.length} high priority</Badge>
          ) : (
            <Badge tone="success">Nothing high priority</Badge>
          )
        }
      />

      {checks.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<SparkIcon className="h-5 w-5" />}
            title="Nothing to clean up"
            description="Every check passed. This page fills up as data arrives from imports and from students adding colleges during onboarding."
          />
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <InfoNote>
              {formatNumber(affected)} records are affected across {checks.length} checks. Work down
              from the top — the high-priority checks are the ones that break something a student or
              an administrator can see.
            </InfoNote>
          </div>

          <Card title="Checks" padded={false}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {checks.map((check) => (
                <li key={check.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={SEVERITY[check.severity].tone}>
                          {SEVERITY[check.severity].label}
                        </Badge>
                        <span className="text-[13.5px] font-medium text-slate-900 dark:text-white">
                          {check.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {check.consequence}
                      </p>
                      <p className="mt-1 text-[12.5px] text-slate-600 dark:text-slate-300">
                        <span className="font-medium text-slate-400 dark:text-slate-500">Fix:</span>{" "}
                        {check.fix}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[19px] font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatNumber(check.count)}
                      </p>
                      <Link
                        href={check.href}
                        className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Open →
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <div className="mt-4">
        <Card
          title="Possible duplicates"
          description="Colleges whose names and district match closely enough to be worth a look."
          padded={false}
        >
          {duplicates.length === 0 ? (
            <EmptyState
              icon={<DatabaseIcon className="h-5 w-5" />}
              title="No likely duplicates"
              description="No two colleges share the opening of their name and a district. Exact duplicates are already impossible — the name index prevents them."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {duplicates.map((group) => (
                <li key={group.key} className="px-4 py-3">
                  <p className="mb-2 text-[11.5px] uppercase tracking-[0.05em] text-slate-400">
                    {group.colleges.length} similar in{" "}
                    {group.colleges[0].districtName ?? "an unrecorded district"}
                  </p>
                  <ul className="space-y-1.5">
                    {group.colleges.map((college) => (
                      <li
                        key={college.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 px-2.5 py-1.5 dark:border-slate-800"
                      >
                        <Link
                          href={`/admin/colleges/${college.id}`}
                          className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 hover:underline dark:text-slate-100"
                        >
                          {college.name}
                        </Link>
                        {college.source === "student" && <Badge tone="purple">Student</Badge>}
                        <VerificationBadge status={college.verificationStatus} />
                        <span className="shrink-0 text-[12px] tabular-nums text-slate-400">
                          {formatNumber(college.studentCount)} students
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <InfoNote>
              Grouping is by the first four words of the name plus the district — deliberately
              blunt. The unique name index already makes exact duplicates impossible, so what is
              left is the near-miss, and a stricter rule would miss most of them. Merging is a
              manual decision: pick the record with students attached, correct it, and archive the
              other.
            </InfoNote>
          </div>
        </Card>
      </div>
    </div>
  );
}
