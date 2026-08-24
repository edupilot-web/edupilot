"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { diffFields, newBatchId, recordAudit } from "@/lib/admin/audit";
import { requirePermission } from "@/lib/admin/current-admin";
import {
  AUTONOMY_STATUSES,
  INSTITUTION_TYPES,
  MANAGEMENT_TYPES,
  MIN_ESTABLISHED_YEAR,
  RECORD_STATUSES,
  type AffiliationType,
} from "@/lib/admin/institution-fields";
import { College, normalizeCollegeName } from "@/models/College";
import { University } from "@/models/University";
import { Affiliation } from "@/models/Affiliation";
import { AutonomyRecord } from "@/models/AutonomyRecord";
import { City, District, State, isValidPincode } from "@/models/Geo";

export type CollegeFormState = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export type BulkState = { ok?: boolean; message?: string; error?: string };

const GENERIC_FAILURE = "Something went wrong on our end. The change was not saved.";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: string): string | null {
  return value.length ? value : null;
}

const objectId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Select a valid option")
  .optional()
  .or(z.literal(""));

const collegeSchema = z.object({
  name: z.string().min(3, "Enter the college name").max(200, "That name is too long"),
  officialName: z.string().max(250).optional().or(z.literal("")),
  shortName: z.string().max(60).optional().or(z.literal("")),
  code: z.string().max(20, "Codes are at most 20 characters").optional().or(z.literal("")),
  institutionType: z.enum(INSTITUTION_TYPES, { error: "Choose an institution type" }),
  managementType: z.enum(MANAGEMENT_TYPES, { error: "Choose a management type" }),
  autonomyStatus: z.enum(AUTONOMY_STATUSES).default("non-autonomous"),
  universityId: objectId,
  stateId: objectId,
  districtId: objectId,
  cityName: z.string().max(80).optional().or(z.literal("")),
  address: z.string().max(400).optional().or(z.literal("")),
  pincode: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || isValidPincode(value), {
      error: "Enter a six-digit pincode",
    }),
  website: z
    .string()
    .max(300)
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || /^https?:\/\/.+\..+/.test(value), {
      error: "Enter a full URL, including https://",
    }),
  email: z
    .string()
    .max(200)
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      error: "Enter a valid email address",
    }),
  phone: z.string().max(40).optional().or(z.literal("")),
  establishedYear: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) =>
        !value ||
        (Number.isInteger(Number(value)) &&
          Number(value) >= MIN_ESTABLISHED_YEAR &&
          Number(value) <= new Date().getFullYear()),
      { error: `Enter a year between ${MIN_ESTABLISHED_YEAR} and ${new Date().getFullYear()}` }
    ),
  accreditationBody: z.string().max(20).optional().or(z.literal("")),
  accreditationGrade: z.string().max(20).optional().or(z.literal("")),
  status: z.enum(RECORD_STATUSES).default("active"),
  internalNotes: z.string().max(2000).optional().or(z.literal("")),
});

function parseForm(formData: FormData) {
  return collegeSchema.safeParse({
    name: text(formData, "name"),
    officialName: text(formData, "officialName"),
    shortName: text(formData, "shortName"),
    code: text(formData, "code"),
    institutionType: text(formData, "institutionType"),
    managementType: text(formData, "managementType"),
    autonomyStatus: text(formData, "autonomyStatus") || "non-autonomous",
    universityId: text(formData, "universityId"),
    stateId: text(formData, "stateId"),
    districtId: text(formData, "districtId"),
    cityName: text(formData, "cityName"),
    address: text(formData, "address"),
    pincode: text(formData, "pincode"),
    website: text(formData, "website"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    establishedYear: text(formData, "establishedYear"),
    accreditationBody: text(formData, "accreditationBody"),
    accreditationGrade: text(formData, "accreditationGrade"),
    status: text(formData, "status") || "active",
    internalNotes: text(formData, "internalNotes"),
  });
}

/**
 * Resolves the location ids into the denormalised names stored on the college.
 *
 * The names are re-read from the geography collections rather than taken from
 * the form: the browser sends ids, and a submitted label could disagree with
 * the id beside it. What is displayed on ten thousand rows has to come from one
 * place.
 */
async function resolveLocation(input: { stateId?: string; districtId?: string; cityName?: string }) {
  const result: Record<string, unknown> = {
    stateId: null,
    districtId: null,
    cityId: null,
    stateName: null,
    districtName: null,
    cityName: optional(input.cityName ?? ""),
  };

  if (input.stateId) {
    const state = await State.findById(input.stateId).select("name").lean();
    if (state) {
      result.stateId = state._id;
      result.stateName = state.name;
    }
  }

  if (input.districtId) {
    const district = await District.findById(input.districtId).select("name stateId").lean();
    if (district) {
      result.districtId = district._id;
      result.districtName = district.name;
      // The district is the authority on its state: a form that somehow sent a
      // mismatched pair must not produce a college in the wrong one.
      if (!result.stateId) {
        const state = await State.findById(district.stateId).select("name").lean();
        if (state) {
          result.stateId = state._id;
          result.stateName = state.name;
        }
      }
    }
  }

  if (input.cityName && result.districtId) {
    const city = await City.findOne({
      districtId: result.districtId,
      name: containsExact(input.cityName),
    })
      .select("_id name")
      .lean();
    if (city) {
      result.cityId = city._id;
      result.cityName = city.name;
    }
  }

  return result;
}

/** Anchored, case-insensitive exact match — a city name is not a search. */
function containsExact(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

async function resolveUniversity(universityId: string | undefined) {
  if (!universityId) return { universityId: null, universityName: null, universityCode: null };
  const university = await University.findById(universityId).select("name code").lean();
  if (!university) return { universityId: null, universityName: null, universityCode: null };
  return {
    universityId: university._id,
    universityName: university.name,
    universityCode: university.code ?? null,
  };
}

export async function createCollegeAction(
  _prevState: CollegeFormState | undefined,
  formData: FormData
): Promise<CollegeFormState> {
  const admin = await requirePermission("college.create", "/admin/colleges/new");

  const parsed = parseForm(formData);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const input = parsed.data;
  let createdId: string;

  try {
    await connectDB();

    const normalizedName = normalizeCollegeName(input.name);
    const clash = await College.findOne({ normalizedName }).select("_id name").lean();
    if (clash) {
      return {
        errors: {
          name: [`"${clash.name}" already exists. Open that record instead of adding a second one.`],
        },
      };
    }

    const [location, university] = await Promise.all([
      resolveLocation(input),
      resolveUniversity(input.universityId || undefined),
    ]);

    const college = await College.create({
      name: input.name,
      normalizedName,
      officialName: optional(input.officialName ?? ""),
      shortName: optional(input.shortName ?? ""),
      code: input.code ? input.code.toUpperCase() : undefined,
      institutionType: input.institutionType,
      managementType: input.managementType,
      autonomyStatus: input.autonomyStatus,
      ...location,
      ...university,
      address: optional(input.address ?? ""),
      pincode: optional(input.pincode ?? ""),
      website: optional(input.website ?? ""),
      email: optional(input.email ?? ""),
      phone: optional(input.phone ?? ""),
      establishedYear: input.establishedYear ? Number(input.establishedYear) : null,
      accreditations:
        input.accreditationBody && input.accreditationGrade
          ? [{ body: input.accreditationBody, grade: input.accreditationGrade }]
          : [],
      status: input.status,
      internalNotes: optional(input.internalNotes ?? ""),
      // A hand-entered college has not been checked by anyone yet; saying it
      // has would defeat the point of the queue.
      verificationStatus: "not-verified",
      source: "admin",
      createdBy: admin.id,
      updatedBy: admin.id,
    });

    createdId = college._id.toString();

    // The affiliation record is the source of truth; the fields on the college
    // are its cached shadow. Writing one without the other is how the timeline
    // ends up disagreeing with the header.
    if (university.universityId) {
      await openAffiliation({
        collegeId: college._id,
        collegeName: college.name,
        universityId: university.universityId,
        universityName: university.universityName,
        universityCode: university.universityCode,
        type: input.autonomyStatus === "autonomous" ? "autonomous" : "affiliated",
        adminId: admin.id,
      });
    }

    if (input.autonomyStatus !== "non-autonomous") {
      await AutonomyRecord.create({
        collegeId: college._id,
        status: input.autonomyStatus,
        event: "corrected",
        note: "Recorded when the college was added by an administrator.",
        createdBy: admin.id,
      });
    }

    await recordAudit({
      actor: admin,
      action: "college.create",
      entityType: "College",
      entityId: createdId,
      entityLabel: college.name,
      after: {
        name: college.name,
        code: college.code ?? null,
        institutionType: college.institutionType,
        managementType: college.managementType,
        stateName: college.stateName,
        universityName: college.universityName,
      },
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      return { errors: { code: ["That college code is already in use."] } };
    }
    console.error("[admin] could not create the college:", err);
    return { message: GENERIC_FAILURE };
  }

  revalidatePath("/admin/colleges");
  redirect(`/admin/colleges/${createdId}?created=1`);
}

export async function updateCollegeAction(
  _prevState: CollegeFormState | undefined,
  formData: FormData
): Promise<CollegeFormState> {
  const id = text(formData, "id");
  const admin = await requirePermission("college.edit", `/admin/colleges/${id}/edit`);

  if (!mongoose.Types.ObjectId.isValid(id)) return { message: "That college could not be found." };

  const parsed = parseForm(formData);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const input = parsed.data;

  try {
    await connectDB();

    const existing = await College.findById(id);
    if (!existing) return { message: "That college could not be found." };

    const normalizedName = normalizeCollegeName(input.name);
    if (normalizedName !== existing.normalizedName) {
      const clash = await College.findOne({ normalizedName, _id: { $ne: existing._id } })
        .select("name")
        .lean();
      if (clash) {
        return { errors: { name: [`"${clash.name}" already uses that name.`] } };
      }
    }

    const [location, university] = await Promise.all([
      resolveLocation(input),
      resolveUniversity(input.universityId || undefined),
    ]);

    const previousUniversityId = existing.universityId ? String(existing.universityId) : null;
    const nextUniversityId = university.universityId ? String(university.universityId) : null;

    const update = {
      name: input.name,
      normalizedName,
      officialName: optional(input.officialName ?? ""),
      shortName: optional(input.shortName ?? ""),
      code: input.code ? input.code.toUpperCase() : undefined,
      institutionType: input.institutionType,
      managementType: input.managementType,
      autonomyStatus: input.autonomyStatus,
      ...location,
      ...university,
      address: optional(input.address ?? ""),
      pincode: optional(input.pincode ?? ""),
      website: optional(input.website ?? ""),
      email: optional(input.email ?? ""),
      phone: optional(input.phone ?? ""),
      establishedYear: input.establishedYear ? Number(input.establishedYear) : null,
      accreditations:
        input.accreditationBody && input.accreditationGrade
          ? [{ body: input.accreditationBody, grade: input.accreditationGrade }]
          : [],
      status: input.status,
      internalNotes: optional(input.internalNotes ?? ""),
      updatedBy: admin.id,
    };

    const audited = diffFields(
      existing.toObject() as Record<string, unknown>,
      update as Record<string, unknown>,
      [
        "name",
        "code",
        "officialName",
        "institutionType",
        "managementType",
        "autonomyStatus",
        "universityName",
        "stateName",
        "districtName",
        "cityName",
        "pincode",
        "website",
        "email",
        "phone",
        "establishedYear",
        "status",
      ]
    );

    await College.updateOne({ _id: existing._id }, { $set: update }, { runValidators: true });

    // Moving a college to another university opens a new affiliation period and
    // closes the old one, rather than editing the existing row: the previous
    // relationship was real, and students graduated under it.
    if (nextUniversityId !== previousUniversityId) {
      if (nextUniversityId) {
        await openAffiliation({
          collegeId: existing._id,
          collegeName: input.name,
          universityId: university.universityId as mongoose.Types.ObjectId,
          universityName: university.universityName,
          universityCode: university.universityCode,
          type: input.autonomyStatus === "autonomous" ? "autonomous" : "affiliated",
          adminId: admin.id,
        });
      } else {
        await closeActiveAffiliations(existing._id, admin.id);
        await College.updateOne({ _id: existing._id }, { $set: { currentAffiliationId: null } });
      }
    }

    if (existing.autonomyStatus !== input.autonomyStatus) {
      await AutonomyRecord.create({
        collegeId: existing._id,
        status: input.autonomyStatus,
        event: input.autonomyStatus === "autonomous" ? "granted" : "corrected",
        validFrom: input.autonomyStatus === "autonomous" ? new Date() : null,
        note: "Changed from the college edit form.",
        createdBy: admin.id,
      });
    }

    if (audited.changed) {
      await recordAudit({
        actor: admin,
        action: "college.update",
        entityType: "College",
        entityId: id,
        entityLabel: input.name,
        before: audited.before,
        after: audited.after,
      });
    }
  } catch (err) {
    if (isDuplicateKey(err)) {
      return { errors: { code: ["That college code is already in use."] } };
    }
    console.error("[admin] could not update the college:", err);
    return { message: GENERIC_FAILURE };
  }

  revalidatePath(`/admin/colleges/${id}`);
  revalidatePath("/admin/colleges");
  redirect(`/admin/colleges/${id}?saved=1`);
}

/** Verify or reject one college from the detail page or the queue. */
export async function verifyCollegeAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const decision = text(formData, "decision");
  const note = text(formData, "note");
  const admin = await requirePermission("college.verify", `/admin/colleges/${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) return;
  const status = decision === "reject" ? "rejected" : decision === "review" ? "needs-review" : "verified";

  try {
    await connectDB();
    const college = await College.findById(id).select("name verificationStatus").lean();
    if (!college) return;

    await College.updateOne(
      { _id: id },
      {
        $set: {
          verificationStatus: status,
          verifiedAt: status === "verified" ? new Date() : null,
          verifiedBy: admin.id,
          verificationNote: note || null,
        },
      }
    );

    await recordAudit({
      actor: admin,
      action: status === "rejected" ? "college.reject" : "college.verify",
      entityType: "College",
      entityId: id,
      entityLabel: college.name,
      before: { verificationStatus: college.verificationStatus },
      after: { verificationStatus: status },
      metadata: note ? { note } : null,
    });
  } catch (err) {
    console.error("[admin] could not record the verification decision:", err);
  }

  revalidatePath(`/admin/colleges/${id}`);
  revalidatePath("/admin/verification");
  revalidatePath("/admin/colleges");
}

/**
 * Bulk actions from the table (spec §32).
 *
 * Re-checks the permission for the specific action rather than trusting that
 * the button was rendered: the bar is a form, and a form is a public endpoint.
 * Every affected row gets its own audit entry sharing one `batchId`, so the
 * operation reads as one event and still answers "what happened to *this*
 * college?" on the college's own timeline.
 */
export async function bulkCollegeAction(
  _prevState: BulkState | undefined,
  formData: FormData
): Promise<BulkState> {
  const action = text(formData, "action");
  const ids = formData
    .getAll("ids")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => mongoose.Types.ObjectId.isValid(value));

  if (!action) return { error: "No action was chosen." };
  if (ids.length === 0) return { error: "No rows were selected." };
  // A bulk write is cheap to issue and expensive to undo. The cap is a guard
  // against a select-all on a filter that matched far more than intended.
  if (ids.length > 500) return { error: "Select at most 500 rows at a time." };

  const permission =
    action === "delete"
      ? "college.delete"
      : action === "verify" || action === "reject"
        ? "college.verify"
        : "college.edit";
  const admin = await requirePermission(permission, "/admin/colleges");

  try {
    await connectDB();

    const colleges = await College.find({ _id: { $in: ids } })
      .select("name verificationStatus status")
      .lean();
    if (colleges.length === 0) return { error: "Those rows no longer exist." };

    const batchId = newBatchId();
    let update: Record<string, unknown>;
    let auditAction: string;

    switch (action) {
      case "verify":
        update = { verificationStatus: "verified", verifiedAt: new Date(), verifiedBy: admin.id };
        auditAction = "college.verify";
        break;
      case "reject":
        update = { verificationStatus: "rejected", verifiedAt: null, verifiedBy: admin.id };
        auditAction = "college.reject";
        break;
      case "activate":
        update = { status: "active" };
        auditAction = "college.bulk.update";
        break;
      case "deactivate":
        update = { status: "inactive" };
        auditAction = "college.bulk.update";
        break;
      case "archive":
      case "delete":
        // Archive, never remove. A college is referenced by student profiles,
        // affiliations and audit rows; deleting the document would leave every
        // one of them pointing at nothing.
        update = { status: "archived" };
        auditAction = "college.delete";
        break;
      default:
        return { error: "That action is not recognised." };
    }

    await College.updateMany(
      { _id: { $in: ids } },
      { $set: { ...update, updatedBy: admin.id } }
    );

    await Promise.all(
      colleges.map((college) =>
        recordAudit({
          actor: admin,
          action: auditAction,
          entityType: "College",
          entityId: String(college._id),
          entityLabel: college.name,
          before: {
            verificationStatus: college.verificationStatus,
            status: college.status,
          },
          after: update,
          batchId,
          metadata: { bulk: true, selectionSize: ids.length },
        })
      )
    );

    revalidatePath("/admin/colleges");
    revalidatePath("/admin/verification");

    return {
      ok: true,
      message: `${colleges.length} ${colleges.length === 1 ? "college" : "colleges"} updated.`,
    };
  } catch (err) {
    console.error("[admin] bulk college action failed:", err);
    return { error: GENERIC_FAILURE };
  }
}

// ── Affiliation helpers ────────────────────────────────────────────────────

async function closeActiveAffiliations(
  collegeId: mongoose.Types.ObjectId,
  adminId: string
): Promise<void> {
  await Affiliation.updateMany(
    { collegeId, status: "active" },
    { $set: { status: "expired", endDate: new Date(), createdBy: adminId } }
  );
}

/**
 * Opens a new affiliation period, closing whatever was live.
 *
 * "Exactly one active affiliation per college" is an application invariant, not
 * an index: a *pending* row that has not started yet is also legitimately
 * `active`-shaped, so no partial unique index can express the rule without
 * banning that too.
 */
async function openAffiliation(input: {
  collegeId: mongoose.Types.ObjectId;
  collegeName: string;
  universityId: mongoose.Types.ObjectId;
  universityName: string | null;
  universityCode: string | null;
  type: AffiliationType;
  adminId: string;
}): Promise<void> {
  await closeActiveAffiliations(input.collegeId, input.adminId);

  const affiliation = await Affiliation.create({
    collegeId: input.collegeId,
    collegeName: input.collegeName,
    universityId: input.universityId,
    universityName: input.universityName,
    universityCode: input.universityCode,
    type: input.type,
    status: "active",
    startDate: new Date(),
    createdBy: input.adminId,
  });

  await College.updateOne(
    { _id: input.collegeId },
    { $set: { currentAffiliationId: affiliation._id } }
  );

  // The counter drives the university list and the dashboard's top-universities
  // chart, so it is maintained here rather than counted per render.
  await University.updateOne({ _id: input.universityId }, { $inc: { collegeCount: 1 } });
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
