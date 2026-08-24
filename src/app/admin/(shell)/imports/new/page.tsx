import type { Metadata } from "next";
import { ImportSteps, UploadStep } from "@/components/admin/import-wizard";
import { InfoNote, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { MAX_FILE_BYTES } from "@/lib/admin/import/parse";

export const metadata: Metadata = { title: "Import colleges" };

export default async function NewImportPage() {
  await requirePermission("college.import", "/admin/imports/new");

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Import / Export", href: "/admin/imports" },
          { label: "New import" },
        ]}
        title="Import colleges"
        description="Upload a spreadsheet, check how the columns map, review what would change, then commit."
      />

      <ImportSteps current="upload" />

      <div className="mb-4">
        <InfoNote>
          Nothing is written until the last step. Uploading parses the file and stores the rows so
          they can be validated and reviewed — the college directory is untouched until you confirm.
        </InfoNote>
      </div>

      <UploadStep maxBytes={MAX_FILE_BYTES} />
    </div>
  );
}
