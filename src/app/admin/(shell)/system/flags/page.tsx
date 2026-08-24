import type { Metadata } from "next";
import { connectDB } from "@/lib/db";
import { FlagRow } from "@/components/admin/flag-row";
import { Card, InfoNote, PageHeader } from "@/components/admin/ui";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatRelative } from "@/lib/admin/format";
import { FeatureFlag } from "@/models/SystemModels";

export const metadata: Metadata = { title: "Feature flags" };

/**
 * Feature flags (spec §36).
 *
 * Four states rather than a boolean: off, on, beta (on for named roles) and a
 * percentage rollout. A rollout buckets by a hash of the user id rather than at
 * random, so a student who sees a feature keeps seeing it — a flag that flips
 * per page load is worse than one that is simply off.
 */
export default async function FeatureFlagsPage() {
  const admin = await requirePermission("system.view", "/admin/system/flags");
  const editable = can(admin, "system.manage_flags");

  await connectDB();
  const flags = await FeatureFlag.find({}).sort({ name: 1 }).lean();

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="Feature flags"
        description="Turn platform features on, off, or on for a percentage of students."
        breadcrumbs={[{ label: "System" }, { label: "Feature Flags" }]}
      />

      <Card padded={false}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {flags.map((flag) => (
            <li key={String(flag._id)}>
              <FlagRow
                flagKey={flag.key}
                name={flag.name}
                description={flag.description ?? null}
                state={flag.state}
                rolloutPercentage={flag.rolloutPercentage}
                enabledForRoles={flag.enabledForRoles ?? []}
                editable={editable}
                updatedBy={flag.updatedByName ?? null}
                updatedAt={flag.updatedAt ? formatRelative(flag.updatedAt) : null}
              />
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4">
        <InfoNote>
          Flags are read by the student app, not by the admin — turning one off hides a feature from
          students while leaving every admin screen for it intact. Rollout percentages bucket on a
          hash of the student id, so the same student sees the same answer every time.
        </InfoNote>
      </div>
    </div>
  );
}
