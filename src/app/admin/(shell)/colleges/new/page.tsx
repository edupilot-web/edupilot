import type { Metadata } from "next";
import { CollegeForm, type CollegeFormValues } from "@/components/admin/college-form";
import { InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { getCollegeFormOptions, getDistrictsByState } from "@/lib/admin/data/colleges";

export const metadata: Metadata = { title: "Add a college" };

const BLANK: CollegeFormValues = {
  name: "",
  officialName: "",
  shortName: "",
  code: "",
  institutionType: "Affiliated College",
  managementType: "Private Unaided",
  autonomyStatus: "non-autonomous",
  universityId: "",
  stateId: "",
  districtId: "",
  cityName: "",
  address: "",
  pincode: "",
  website: "",
  email: "",
  phone: "",
  establishedYear: "",
  accreditationBody: "",
  accreditationGrade: "",
  status: "active",
  internalNotes: "",
};

export default async function NewCollegePage() {
  await requirePermission("college.create", "/admin/colleges/new");

  const [options, districtsByState] = await Promise.all([
    getCollegeFormOptions(),
    getDistrictsByState(),
  ]);

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Colleges", href: "/admin/colleges" },
          { label: "Add" },
        ]}
        title="Add a college"
        description="For a single institution. To add many at once, use the import wizard."
      />

      <div className="mb-4">
        <InfoNote>
          A college added here starts as <strong>Not Verified</strong> and goes into the verification
          queue. Saying it is verified on the way in would defeat the point of the queue.
        </InfoNote>
      </div>

      <CollegeForm
        mode="create"
        defaults={BLANK}
        options={options}
        districtsByState={districtsByState}
      />
    </div>
  );
}
