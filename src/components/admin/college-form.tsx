"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BUTTON_STYLES, Card, ErrorState } from "@/components/admin/ui";
import { createCollegeAction, updateCollegeAction } from "@/lib/admin/actions/colleges";
import {
  ACCREDITATION_BODIES,
  AUTONOMY_STATUSES,
  AUTONOMY_STATUS_LABELS,
  INSTITUTION_TYPES,
  MANAGEMENT_TYPES,
  NAAC_GRADES,
  RECORD_STATUSES,
} from "@/lib/admin/institution-fields";

export type CollegeFormValues = {
  id?: string;
  name: string;
  officialName: string;
  shortName: string;
  code: string;
  institutionType: string;
  managementType: string;
  autonomyStatus: string;
  universityId: string;
  stateId: string;
  districtId: string;
  cityName: string;
  address: string;
  pincode: string;
  website: string;
  email: string;
  phone: string;
  establishedYear: string;
  accreditationBody: string;
  accreditationGrade: string;
  status: string;
  internalNotes: string;
};

export type FormOptions = {
  states: { id: string; name: string; code: string }[];
  districts: { id: string; name: string }[];
  universities: { id: string; name: string; shortName: string | null; stateName: string | null }[];
};

/**
 * Add and edit a college.
 *
 * One component for both, because the fields, the validation and the layout are
 * identical and only the action differs. Two forms would drift — a field added
 * to "add" and forgotten in "edit" is the classic version of that bug.
 *
 * The district list is filtered in the browser from the full set rather than
 * re-fetched when the state changes. There are ~60 districts across the launch
 * states; shipping them all is smaller than the JSON of one round trip, and the
 * field stays usable with no network.
 */
export function CollegeForm({
  mode,
  defaults,
  options,
  districtsByState,
}: {
  mode: "create" | "edit";
  defaults: CollegeFormValues;
  options: FormOptions;
  /** All districts, keyed by state id, so the picker filters without a fetch. */
  districtsByState: Record<string, { id: string; name: string }[]>;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createCollegeAction : updateCollegeAction,
    undefined
  );

  const [values, setValues] = useState(defaults);

  function set<K extends keyof CollegeFormValues>(key: K, value: CollegeFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const districts = values.stateId ? (districtsByState[values.stateId] ?? []) : [];
  const universities = values.stateId
    ? options.universities.filter(
        (university) =>
          !university.stateName ||
          university.stateName ===
            options.states.find((entry) => entry.id === values.stateId)?.name
      )
    : options.universities;

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && <input type="hidden" name="id" value={values.id} />}

      {state?.message && <ErrorState title="Could not save" detail={state.message} />}

      <Card title="Institution" description="What the college is called and how it is run.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text
            label="College name"
            name="name"
            required
            value={values.name}
            onChange={(value) => set("name", value)}
            errors={state?.errors?.name}
            hint="The name students will search for."
            span
          />
          <Text
            label="Official name"
            name="officialName"
            value={values.officialName}
            onChange={(value) => set("officialName", value)}
            errors={state?.errors?.officialName}
            hint="The full legal name, if it differs."
          />
          <Text
            label="Short name"
            name="shortName"
            value={values.shortName}
            onChange={(value) => set("shortName", value)}
            errors={state?.errors?.shortName}
          />
          <Text
            label="College code"
            name="code"
            value={values.code}
            onChange={(value) => set("code", value.toUpperCase())}
            errors={state?.errors?.code}
            hint="AICTE or university code. Must be unique."
          />
          <Text
            label="Established year"
            name="establishedYear"
            type="number"
            value={values.establishedYear}
            onChange={(value) => set("establishedYear", value)}
            errors={state?.errors?.establishedYear}
          />
          <Select
            label="Institution type"
            name="institutionType"
            value={values.institutionType}
            onChange={(value) => set("institutionType", value)}
            options={INSTITUTION_TYPES.map((type) => ({ value: type, label: type }))}
            errors={state?.errors?.institutionType}
          />
          <Select
            label="Management type"
            name="managementType"
            value={values.managementType}
            onChange={(value) => set("managementType", value)}
            options={MANAGEMENT_TYPES.map((type) => ({ value: type, label: type }))}
            errors={state?.errors?.managementType}
          />
        </div>
      </Card>

      <Card
        title="Affiliation and autonomy"
        description="Changing either of these writes a new history entry rather than overwriting the last one."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Affiliating university"
            name="universityId"
            value={values.universityId}
            onChange={(value) => set("universityId", value)}
            options={[
              { value: "", label: "None / not known" },
              ...universities.map((university) => ({
                value: university.id,
                label: university.shortName
                  ? `${university.name} (${university.shortName})`
                  : university.name,
              })),
            ]}
            errors={state?.errors?.universityId}
            hint={
              values.stateId
                ? "Filtered to universities in the selected state."
                : "Choose a state to narrow this list."
            }
          />
          <Select
            label="Autonomy status"
            name="autonomyStatus"
            value={values.autonomyStatus}
            onChange={(value) => set("autonomyStatus", value)}
            options={AUTONOMY_STATUSES.map((status) => ({
              value: status,
              label: AUTONOMY_STATUS_LABELS[status],
            }))}
            errors={state?.errors?.autonomyStatus}
            hint="Grant dates and the approving authority are recorded on the college's Autonomy tab."
          />
        </div>
      </Card>

      <Card title="Location">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="State"
            name="stateId"
            value={values.stateId}
            onChange={(value) => {
              set("stateId", value);
              // The district belongs to the old state and is now meaningless.
              set("districtId", "");
            }}
            options={[
              { value: "", label: "Not set" },
              ...options.states.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
            errors={state?.errors?.stateId}
          />
          <Select
            label="District"
            name="districtId"
            value={values.districtId}
            onChange={(value) => set("districtId", value)}
            options={[
              { value: "", label: values.stateId ? "Not set" : "Choose a state first" },
              ...districts.map((district) => ({ value: district.id, label: district.name })),
            ]}
            disabled={!values.stateId || districts.length === 0}
            errors={state?.errors?.districtId}
            hint={
              values.stateId && districts.length === 0
                ? "No districts are recorded for this state yet. Add them under Geography."
                : undefined
            }
          />
          <Text
            label="City / town"
            name="cityName"
            value={values.cityName}
            onChange={(value) => set("cityName", value)}
            errors={state?.errors?.cityName}
          />
          <Text
            label="Pincode"
            name="pincode"
            inputMode="numeric"
            value={values.pincode}
            onChange={(value) => set("pincode", value.replace(/\D/g, "").slice(0, 6))}
            errors={state?.errors?.pincode}
          />
          <Text
            label="Address"
            name="address"
            value={values.address}
            onChange={(value) => set("address", value)}
            errors={state?.errors?.address}
            span
          />
        </div>
      </Card>

      <Card title="Contact and accreditation">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text
            label="Website"
            name="website"
            value={values.website}
            onChange={(value) => set("website", value)}
            errors={state?.errors?.website}
            placeholder="https://"
          />
          <Text
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onChange={(value) => set("email", value)}
            errors={state?.errors?.email}
          />
          <Text
            label="Phone"
            name="phone"
            value={values.phone}
            onChange={(value) => set("phone", value)}
            errors={state?.errors?.phone}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Accreditation"
              name="accreditationBody"
              value={values.accreditationBody}
              onChange={(value) => set("accreditationBody", value)}
              options={[
                { value: "", label: "None" },
                ...ACCREDITATION_BODIES.map((body) => ({ value: body, label: body })),
              ]}
            />
            <Select
              label="Grade"
              name="accreditationGrade"
              value={values.accreditationGrade}
              onChange={(value) => set("accreditationGrade", value)}
              options={[
                { value: "", label: "—" },
                ...NAAC_GRADES.map((grade) => ({ value: grade, label: grade })),
              ]}
              disabled={!values.accreditationBody}
            />
          </div>
        </div>
      </Card>

      <Card title="Record">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Status"
            name="status"
            value={values.status}
            onChange={(value) => set("status", value)}
            options={RECORD_STATUSES.map((status) => ({
              value: status,
              label: status.charAt(0).toUpperCase() + status.slice(1),
            }))}
            hint="Only active colleges are offered to students during onboarding."
          />
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
              Internal notes
            </label>
            <textarea
              name="internalNotes"
              rows={3}
              value={values.internalNotes}
              onChange={(event) => set("internalNotes", event.target.value)}
              placeholder="Context for other administrators. Never shown to students."
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2 pb-6">
        <Link
          href={mode === "edit" ? `/admin/colleges/${values.id}` : "/admin/colleges"}
          className={BUTTON_STYLES.secondary}
        >
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={BUTTON_STYLES.primary}>
          {pending ? "Saving…" : mode === "create" ? "Create college" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ── Field primitives ───────────────────────────────────────────────────────

const FIELD_BASE =
  "w-full rounded-lg border px-3 py-2 text-[13.5px] outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900";
const FIELD_IDLE =
  "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700";
const FIELD_INVALID =
  "border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 dark:border-rose-500/60";

function Text({
  label,
  name,
  value,
  onChange,
  errors,
  hint,
  type = "text",
  placeholder,
  required,
  span,
  inputMode,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  hint?: string;
  type?: "text" | "email" | "number";
  placeholder?: string;
  required?: boolean;
  span?: boolean;
  inputMode?: "numeric";
}) {
  const invalid = Boolean(errors?.length);
  return (
    <div className={span ? "sm:col-span-2" : undefined}>
      <label
        htmlFor={`field-${name}`}
        className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `field-${name}-error` : hint ? `field-${name}-hint` : undefined}
        className={`${FIELD_BASE} ${invalid ? FIELD_INVALID : FIELD_IDLE}`}
      />
      {invalid ? (
        <p id={`field-${name}-error`} className="mt-1 text-[11.5px] font-medium text-rose-600 dark:text-rose-400">
          {errors![0]}
        </p>
      ) : hint ? (
        <p id={`field-${name}-hint`} className="mt-1 text-[11.5px] text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
  errors,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  errors?: string[];
  hint?: string;
  disabled?: boolean;
}) {
  const invalid = Boolean(errors?.length);
  return (
    <div>
      <label
        htmlFor={`field-${name}`}
        className="mb-1.5 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      <select
        id={`field-${name}`}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className={`${FIELD_BASE} ${invalid ? FIELD_INVALID : FIELD_IDLE}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {invalid ? (
        <p className="mt-1 text-[11.5px] font-medium text-rose-600 dark:text-rose-400">{errors![0]}</p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}
