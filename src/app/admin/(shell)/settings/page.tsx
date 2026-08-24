import type { Metadata } from "next";
import Link from "next/link";
import { connectDB } from "@/lib/db";
import { SettingRow } from "@/components/admin/setting-row";
import { Badge, Card, InfoNote, PageHeader } from "@/components/admin/ui";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatRelative } from "@/lib/admin/format";
import {
  ACCREDITATION_BODIES,
  AUTONOMY_STATUSES,
  INSTITUTION_TYPES,
  MANAGEMENT_TYPES,
  PROGRAM_LEVELS,
  PROGRAM_MODES,
  UNIVERSITY_TYPES,
  VERIFICATION_STATUSES,
} from "@/lib/admin/institution-fields";
import { DEGREES, SPECIALIZATION_SUGGESTIONS } from "@/lib/user-fields";
import { Setting } from "@/models/SystemModels";
import { State } from "@/models/Geo";
import { AcademicYear } from "@/models/AcademicStructure";

export const metadata: Metadata = { title: "Settings" };

const GROUPS = [
  { key: "general", label: "General", blurb: "Platform identity and defaults." },
  { key: "academic", label: "Academic", blurb: "The academic calendar and year bounds." },
  { key: "institution", label: "Institution", blurb: "How college data is governed." },
  { key: "security", label: "Security", blurb: "Session lifetimes and sign-in policy." },
  { key: "communication", label: "Communication", blurb: "Who outgoing email comes from." },
];

/**
 * Platform configuration (spec §35).
 *
 * Two kinds of thing live here, and the page keeps them apart:
 *
 * - **Settings** are rows in `settings` and are editable, each with its own
 *   audit entry.
 * - **Vocabularies** — institution types, degrees, verification statuses — are
 *   code constants that the schemas enforce. They are shown read-only rather
 *   than hidden, because an operator asking "what values can this field take?"
 *   deserves an answer, and an editor that silently could not change them would
 *   be worse than none.
 */
export default async function SettingsPage() {
  const admin = await requirePermission("system.view", "/admin/settings");
  const editable = can(admin, "system.configure");

  await connectDB();
  const [settings, states, years] = await Promise.all([
    Setting.find({}).sort({ group: 1, key: 1 }).lean(),
    State.countDocuments({ active: true }),
    AcademicYear.find({}).select("label isCurrent status").sort({ startDate: -1 }).lean(),
  ]);

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title="Settings"
        description="Platform configuration and the master-data vocabularies the schemas enforce."
        breadcrumbs={[{ label: "System" }, { label: "Settings" }]}
        meta={editable ? undefined : <Badge tone="neutral">Read only</Badge>}
      />

      {!editable && (
        <div className="mb-4">
          <InfoNote>
            You can see these values but not change them — changing configuration needs the{" "}
            <strong>System · Configure</strong> permission.
          </InfoNote>
        </div>
      )}

      <div className="space-y-4">
        {GROUPS.map((group) => {
          const rows = settings.filter((setting) => setting.group === group.key);
          if (rows.length === 0) return null;

          return (
            <Card key={group.key} title={group.label} description={group.blurb} padded={false}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((setting) => (
                  <li key={String(setting._id)}>
                    <SettingRow
                      settingKey={setting.key}
                      label={setting.label}
                      description={setting.description ?? null}
                      value={setting.value as string | number | boolean | null}
                      valueType={setting.valueType}
                      editable={editable}
                      updatedBy={setting.updatedByName ?? null}
                      updatedAt={setting.updatedAt ? formatRelative(setting.updatedAt) : null}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}

        <Card
          title="Academic years"
          description="Managed as records, not as a setting — each has dates and a status."
          padded={false}
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {years.map((year) => (
              <li
                key={String(year._id)}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  {year.label}
                </span>
                <span className="flex items-center gap-2">
                  {year.isCurrent && <Badge tone="success">Current</Badge>}
                  <span className="text-[12px] capitalize text-slate-400">{year.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Geography"
          description="States, districts and cities are records, and are managed on their own screen."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-slate-600 dark:text-slate-300">
              {states} active states and union territories
            </p>
            <Link
              href="/admin/geography"
              className="text-[12.5px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Manage geography →
            </Link>
          </div>
        </Card>

        <Card
          title="Vocabularies"
          description="Enforced by the database schemas. Changing one is a code change, so they are shown here rather than edited."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Vocabulary label="Institution types" values={INSTITUTION_TYPES} />
            <Vocabulary label="Management types" values={MANAGEMENT_TYPES} />
            <Vocabulary label="University types" values={UNIVERSITY_TYPES} />
            <Vocabulary label="Autonomy statuses" values={AUTONOMY_STATUSES} />
            <Vocabulary label="Verification statuses" values={VERIFICATION_STATUSES} />
            <Vocabulary label="Accreditation bodies" values={ACCREDITATION_BODIES} />
            <Vocabulary label="Degrees" values={DEGREES} />
            <Vocabulary label="Program levels" values={PROGRAM_LEVELS} />
            <Vocabulary label="Program modes" values={PROGRAM_MODES} />
            <Vocabulary
              label="Specialization suggestions"
              values={SPECIALIZATION_SUGGESTIONS.slice(0, 8)}
              more={SPECIALIZATION_SUGGESTIONS.length - 8}
              note="Suggestions only — students may type anything."
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Vocabulary({
  label,
  values,
  more,
  note,
}: {
  label: string;
  values: readonly string[];
  more?: number;
  note?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.05em] text-slate-400">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11.5px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {value}
          </span>
        ))}
        {more && more > 0 && (
          <span className="rounded-md px-1.5 py-0.5 text-[11.5px] text-slate-400">
            +{more} more
          </span>
        )}
      </div>
      {note && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}
