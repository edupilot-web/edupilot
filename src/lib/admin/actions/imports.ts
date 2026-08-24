"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { requirePermission } from "@/lib/admin/current-admin";
import { commitJob, validateJob } from "@/lib/admin/import/engine";
import { ImportParseError, parseUpload } from "@/lib/admin/import/parse";
import { autoMapColumns, importField } from "@/lib/admin/import/schema";
import { ImportJob, ImportRow } from "@/models/ImportJob";

export type UploadState = { error?: string };
export type WizardState = { error?: string; message?: string };

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Step 1 — upload and parse.
 *
 * The file is parsed and its rows are written to `importRows` immediately, then
 * the file itself is discarded. Two reasons: nothing later in the wizard needs
 * the bytes again, and storing uploaded files means storing them somewhere,
 * securing them, and eventually deleting them.
 */
export async function uploadImportAction(
  _prevState: UploadState | undefined,
  formData: FormData
): Promise<UploadState> {
  const admin = await requirePermission("college.import", "/admin/imports/new");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV or Excel file to upload." };
  }

  let jobId: string;

  try {
    const parsed = await parseUpload(file);

    if (parsed.rows.length === 0) {
      return { error: "That file has headers but no data rows." };
    }

    await connectDB();

    const job = await ImportJob.create({
      entity: "college",
      stage: "mapping",
      fileName: file.name,
      fileSize: file.size,
      fileType: file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
      sourceColumns: parsed.columns,
      columnMapping: autoMapColumns(parsed.columns),
      totalRows: parsed.rows.length,
      uploadedBy: admin.id,
      uploadedByName: admin.name,
    });

    jobId = job._id.toString();

    // Inserted in batches: one 50,000-document insert exceeds the 16MB command
    // limit, and a hundred at a time keeps memory flat.
    const BATCH = 500;
    for (let start = 0; start < parsed.rows.length; start += BATCH) {
      const slice = parsed.rows.slice(start, start + BATCH);
      await ImportRow.insertMany(
        slice.map((row, offset) => ({
          jobId: job._id,
          rowNumber: start + offset + 1,
          raw: row,
          status: "pending",
        })),
        { ordered: false }
      );
    }

    await recordAudit({
      actor: admin,
      action: "import.upload",
      entityType: "ImportJob",
      entityId: jobId,
      entityLabel: file.name,
      after: { rows: parsed.rows.length, columns: parsed.columns.length },
    });
  } catch (err) {
    if (err instanceof ImportParseError) return { error: err.message };
    console.error("[import] upload failed:", err);
    return { error: "That file could not be read. Check it opens in Excel, then try again." };
  }

  redirect(`/admin/imports/${jobId}/map`);
}

/** Step 2 — save the column mapping, then validate. */
export async function saveMappingAction(
  _prevState: WizardState | undefined,
  formData: FormData
): Promise<WizardState> {
  const jobId = text(formData, "jobId");
  const admin = await requirePermission("college.import", `/admin/imports/${jobId}/map`);

  if (!mongoose.Types.ObjectId.isValid(jobId)) return { error: "That import could not be found." };

  try {
    await connectDB();
    const job = await ImportJob.findById(jobId);
    if (!job) return { error: "That import could not be found." };

    const mapping: Record<string, string> = {};
    const used = new Set<string>();

    for (const column of job.sourceColumns) {
      const fieldKey = text(formData, `map:${column}`);
      if (!fieldKey) {
        mapping[column] = "";
        continue;
      }
      if (!importField(fieldKey)) {
        return { error: `"${fieldKey}" is not a field this import understands.` };
      }
      // Two columns mapped to one field would make the last one silently win.
      if (used.has(fieldKey)) {
        return {
          error: `Two columns are both mapped to "${importField(fieldKey)?.label}". Map one of them to "Ignore".`,
        };
      }
      used.add(fieldKey);
      mapping[column] = fieldKey;
    }

    if (!used.has("name")) {
      return { error: "One column must be mapped to College name — nothing can be imported without it." };
    }
    if (!used.has("stateName")) {
      return { error: "One column must be mapped to State." };
    }

    await ImportJob.updateOne(
      { _id: job._id },
      {
        $set: {
          columnMapping: mapping,
          stage: "validating",
          "options.createMissingUniversities": formData.get("createMissingUniversities") === "on",
        },
      }
    );

    await validateJob(jobId);

    await recordAudit({
      actor: admin,
      action: "import.validate",
      entityType: "ImportJob",
      entityId: jobId,
      entityLabel: job.fileName,
      after: { mappedColumns: used.size },
    });
  } catch (err) {
    console.error("[import] validation failed:", err);
    await ImportJob.updateOne(
      { _id: jobId },
      { $set: { stage: "failed", errorMessage: "Validation could not complete." } }
    ).catch(() => {});
    return { error: "Validation could not complete. The import was left untouched." };
  }

  redirect(`/admin/imports/${jobId}/review`);
}

/** Step 5 — record how one duplicate row should be resolved. */
export async function resolveRowAction(formData: FormData): Promise<void> {
  const jobId = text(formData, "jobId");
  const rowId = text(formData, "rowId");
  const resolution = text(formData, "resolution");
  await requirePermission("college.import", `/admin/imports/${jobId}/review`);

  if (!mongoose.Types.ObjectId.isValid(rowId)) return;
  if (!["keep-existing", "update-existing", "create-new", "skip"].includes(resolution)) return;

  await connectDB();
  await ImportRow.updateOne({ _id: rowId }, { $set: { resolution } });

  revalidatePath(`/admin/imports/${jobId}/review`);
}

/** Applies one resolution to every unresolved duplicate in the job. */
export async function resolveAllAction(formData: FormData): Promise<void> {
  const jobId = text(formData, "jobId");
  const resolution = text(formData, "resolution");
  await requirePermission("college.import", `/admin/imports/${jobId}/review`);

  if (!mongoose.Types.ObjectId.isValid(jobId)) return;
  if (!["keep-existing", "update-existing", "create-new", "skip"].includes(resolution)) return;

  await connectDB();
  await ImportRow.updateMany({ jobId, status: "duplicate" }, { $set: { resolution } });
  await ImportJob.updateOne(
    { _id: jobId },
    {
      $set: {
        "options.duplicateStrategy":
          resolution === "update-existing" ? "update" : resolution === "create-new" ? "create" : "skip",
      },
    }
  );

  revalidatePath(`/admin/imports/${jobId}/review`);
}

/**
 * Step 7 — commit.
 *
 * The only step that writes to `colleges`, and it is behind an explicit
 * confirmation naming the counts. Everything before it is reversible by
 * abandoning the job.
 */
export async function commitImportAction(
  _prevState: WizardState | undefined,
  formData: FormData
): Promise<WizardState> {
  const jobId = text(formData, "jobId");
  const admin = await requirePermission("college.import", `/admin/imports/${jobId}/review`);

  if (!mongoose.Types.ObjectId.isValid(jobId)) return { error: "That import could not be found." };

  try {
    await connectDB();
    const job = await ImportJob.findById(jobId).select("fileName stage").lean();
    if (!job) return { error: "That import could not be found." };

    const result = await commitJob(jobId, { id: admin.id, name: admin.name });

    await recordAudit({
      actor: admin,
      action: "import.commit",
      entityType: "ImportJob",
      entityId: jobId,
      entityLabel: job.fileName,
      after: result,
      metadata: { source: "import-wizard" },
    });
  } catch (err) {
    console.error("[import] commit failed:", err);
    await ImportJob.updateOne(
      { _id: jobId },
      { $set: { stage: "failed", errorMessage: "The import stopped partway through." } }
    ).catch(() => {});
    return {
      error:
        "The import stopped partway through. Open it from Import Jobs to see which rows were written.",
    };
  }

  revalidatePath("/admin/colleges");
  revalidatePath("/admin/imports");
  redirect(`/admin/imports/${jobId}`);
}

/** Abandons a job that has not been committed. */
export async function cancelImportAction(formData: FormData): Promise<void> {
  const jobId = text(formData, "jobId");
  const admin = await requirePermission("college.import", "/admin/imports");

  if (!mongoose.Types.ObjectId.isValid(jobId)) return;

  await connectDB();
  const job = await ImportJob.findById(jobId).select("fileName stage").lean();
  if (!job) return;
  // A committed import cannot be cancelled — the rows it wrote are real.
  if (job.stage === "completed" || job.stage === "completed-with-warnings") return;

  await ImportJob.updateOne({ _id: jobId }, { $set: { stage: "cancelled" } });

  await recordAudit({
    actor: admin,
    action: "import.cancel",
    entityType: "ImportJob",
    entityId: jobId,
    entityLabel: job.fileName,
  });

  redirect("/admin/imports");
}
