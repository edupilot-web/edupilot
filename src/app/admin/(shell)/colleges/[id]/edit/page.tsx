import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollegeForm, type CollegeFormValues } from "@/components/admin/college-form";
import { InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { getCollegeDetail, getCollegeFormOptions, getDistrictsByState } from "@/lib/admin/data/colleges";

type Params = Promise<{ id: string }>;

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { id } = await props.params;
  const detail = await getCollegeDetail(id);
  return { title: detail ? `Edit ${detail.doc.name}` : "Edit college" };
}

export default async function EditCollegePage(props: { params: Params }) {
  const { id } = await props.params;
  await requirePermission("college.edit", `/admin/colleges/${id}/edit`);

  const detail = await getCollegeDetail(id);
  if (!detail) notFound();

  const college = detail.doc;
  const [options, districtsByState] = await Promise.all([
    getCollegeFormOptions(college.stateId ? String(college.stateId) : null),
    getDistrictsByState(),
  ]);

  const defaults: CollegeFormValues = {
    id,
    name: college.name,
    officialName: college.officialName ?? "",
    shortName: college.shortName ?? "",
    code: college.code ?? "",
    institutionType: college.institutionType,
    managementType: college.managementType,
    autonomyStatus: college.autonomyStatus,
    universityId: college.universityId ? String(college.universityId) : "",
    stateId: college.stateId ? String(college.stateId) : "",
    districtId: college.districtId ? String(college.districtId) : "",
    cityName: college.cityName ?? "",
    address: college.address ?? "",
    pincode: college.pincode ?? "",
    website: college.website ?? "",
    email: college.email ?? "",
    phone: college.phone ?? "",
    establishedYear: college.establishedYear ? String(college.establishedYear) : "",
    accreditationBody: college.accreditations?.[0]?.body ?? "",
    accreditationGrade: college.accreditations?.[0]?.grade ?? "",
    status: college.status,
    internalNotes: college.internalNotes ?? "",
  };

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Colleges", href: "/admin/colleges" },
          { label: college.name, href: `/admin/colleges/${id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${college.name}`}
        description="Every changed field is recorded in the audit log with its previous value."
      />

      <div className="mb-4">
        <InfoNote>
          Changing the <strong>affiliating university</strong> closes the current affiliation period
          and opens a new one; changing <strong>autonomy status</strong> adds a timeline entry.
          Neither overwrites what came before.
        </InfoNote>
      </div>

      <CollegeForm
        mode="edit"
        defaults={defaults}
        options={options}
        districtsByState={districtsByState}
      />
    </div>
  );
}
