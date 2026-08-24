import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ImportSteps, MappingStep } from "@/components/admin/import-wizard";
import { PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { COLLEGE_IMPORT_FIELDS } from "@/lib/admin/import/schema";
import { getImportJob, getImportSampleRows } from "@/lib/admin/data/imports";

export const metadata: Metadata = { title: "Map columns" };

type Params = Promise<{ id: string }>;

export default async function MapColumnsPage(props: { params: Params }) {
  const { id } = await props.params;
  await requirePermission("college.import", `/admin/imports/${id}/map`);

  const job = await getImportJob(id);
  if (!job) notFound();

  // A committed job has nothing to map. Sending the operator to its result page
  // is more useful than showing a form whose submit would be refused.
  if (["completed", "completed-with-warnings", "cancelled"].includes(job.stage)) {
    redirect(`/admin/imports/${id}`);
  }

  const sample = await getImportSampleRows(id, 3);

  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader
        breadcrumbs={[
          { label: "Institution Management" },
          { label: "Import / Export", href: "/admin/imports" },
          { label: job.fileName },
        ]}
        title="Map columns"
        description="Every column in your file, and the field it will be written to. Anything left as Ignore is dropped."
      />

      <ImportSteps current="map" />

      <MappingStep
        jobId={id}
        fileName={job.fileName}
        rowCount={job.totalRows}
        columns={job.sourceColumns}
        mapping={job.columnMapping}
        fields={COLLEGE_IMPORT_FIELDS.map((field) => ({
          key: field.key,
          label: field.label,
          required: field.required,
          hint: field.hint,
        }))}
        sample={sample}
      />
    </div>
  );
}
