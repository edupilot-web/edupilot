import type { Metadata } from "next";
import Link from "next/link";
import { connectDB } from "@/lib/db";
import { MapPinIcon } from "@/components/admin/icons";
import { Badge, Card, InfoNote, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import { readParam, type SearchParams } from "@/lib/admin/query";
import { City, District, State } from "@/models/Geo";
import { College } from "@/models/College";

export const metadata: Metadata = { title: "Geography" };

/**
 * States, districts and cities (spec §46).
 *
 * The screen that makes "add another state" a data task rather than a code
 * change. Andhra Pradesh and Telangana are seeded with full district lists;
 * every other state is a row waiting for districts, which is exactly what the
 * architecture is supposed to allow.
 */
export default async function GeographyPage(props: PageProps<"/admin/geography">) {
  await requirePermission("geography.view", "/admin/geography");
  const params = (await props.searchParams) as SearchParams;
  const selected = readParam(params, "state");

  await connectDB();

  const states = await State.find({}).sort({ displayOrder: 1, name: 1 }).lean();

  const [districtCounts, cityCounts, collegeCounts] = await Promise.all([
    District.aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: "$stateId", count: { $sum: 1 } } },
    ]),
    City.aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: "$stateId", count: { $sum: 1 } } },
    ]),
    College.aggregate<{ _id: string | null; count: number }>([
      { $match: { status: { $ne: "archived" } } },
      { $group: { _id: "$stateName", count: { $sum: 1 } } },
    ]),
  ]);

  const districtsBy = new Map(districtCounts.map((row) => [String(row._id), row.count]));
  const citiesBy = new Map(cityCounts.map((row) => [String(row._id), row.count]));
  const collegesBy = new Map(collegeCounts.map((row) => [row._id ?? "", row.count]));

  const selectedState = selected ? states.find((state) => state.name === selected) : null;
  const districts = selectedState
    ? await District.find({ stateId: selectedState._id }).sort({ name: 1 }).lean()
    : [];

  const withDistricts = states.filter((state) => (districtsBy.get(String(state._id)) ?? 0) > 0);

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Geography"
        description="The spine every college, university and student location hangs off."
        breadcrumbs={[{ label: "Institution Management" }, { label: "Geography" }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="States & UTs" value={states.length} delta={null} />
        <StatCard
          label="With districts"
          value={withDistricts.length}
          delta={null}
          hint="The rest are ready for expansion"
        />
        <StatCard label="Districts" value={districtsBy.size ? sum(districtsBy) : 0} delta={null} />
        <StatCard label="Cities" value={citiesBy.size ? sum(citiesBy) : 0} delta={null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="States and union territories" padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {states.map((state) => {
              const districtCount = districtsBy.get(String(state._id)) ?? 0;
              const active = state.name === selected;

              return (
                <li key={String(state._id)}>
                  <Link
                    href={
                      active
                        ? "/admin/geography"
                        : `/admin/geography?state=${encodeURIComponent(state.name)}`
                    }
                    aria-current={active ? "true" : undefined}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 ${
                      active
                        ? "bg-blue-50/60 dark:bg-blue-500/5"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{state.code}</span>
                      <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                        {state.name}
                      </span>
                      {state.kind === "union-territory" && <Badge tone="neutral">UT</Badge>}
                      {!state.active && <Badge tone="warning">Hidden</Badge>}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-slate-400">
                      {districtCount > 0 ? (
                        <>
                          {districtCount} districts ·{" "}
                          {formatNumber(collegesBy.get(state.name) ?? 0)} colleges
                        </>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">no districts yet</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title={selectedState ? `Districts of ${selectedState.name}` : "Districts"}
          description={
            selectedState ? undefined : "Choose a state to see the districts recorded for it."
          }
          padded={false}
        >
          {!selectedState ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <MapPinIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">
                Select a state on the left.
              </p>
            </div>
          ) : districts.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[13.5px] font-medium text-slate-800 dark:text-slate-100">
                No districts recorded
              </p>
              <p className="mx-auto mt-1 max-w-xs text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                {selectedState.name} is in the system, but its districts have not been added. A
                college here can still be created — its district field will simply be empty.
              </p>
            </div>
          ) : (
            <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {districts.map((district) => (
                <li
                  key={String(district._id)}
                  className="flex items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="truncate text-[13px] text-slate-800 dark:text-slate-100">
                    {district.name}
                  </span>
                  <Link
                    href={`/admin/colleges?state=${encodeURIComponent(selectedState.name)}&district=${encodeURIComponent(district.name)}`}
                    className="shrink-0 text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Colleges →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <InfoNote>
          Andhra Pradesh and Telangana carry full district lists because that is where the platform
          launches. The other states are rows with no districts yet — nothing in the application
          names a state, so expanding is a matter of adding data here, not of changing code.
        </InfoNote>
      </div>
    </div>
  );
}

function sum(map: Map<string, number>): number {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}
