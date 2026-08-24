"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { UploadIcon } from "@/components/admin/icons";
import { BUTTON_STYLES, Card, ErrorState, InfoNote } from "@/components/admin/ui";
import {
  commitImportAction,
  saveMappingAction,
  uploadImportAction,
} from "@/lib/admin/actions/imports";
import { formatBytes, formatNumber } from "@/lib/admin/format";

/**
 * The wizard's step rail.
 *
 * Server-rendered on every step page rather than held in client state, so
 * refreshing or sharing a URL lands on the right step — the job's `stage` in
 * the database is the source of truth for how far along it is, not the browser.
 */
export const IMPORT_STEPS = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map columns" },
  { key: "review", label: "Validate & review" },
  { key: "done", label: "Result" },
] as const;

export type ImportStepKey = (typeof IMPORT_STEPS)[number]["key"];

export function ImportSteps({ current }: { current: ImportStepKey }) {
  const currentIndex = IMPORT_STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2" aria-label="Import progress">
      {IMPORT_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12.5px] font-medium ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : done
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              }`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[10.5px] font-bold ${
                  active
                    ? "bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900"
                    : done
                      ? "bg-emerald-500 text-white"
                      : "bg-white text-slate-400 dark:bg-slate-700"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              {step.label}
            </span>
            {index < IMPORT_STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`h-px w-5 ${done ? "bg-emerald-300" : "bg-slate-200 dark:bg-slate-700"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 1: upload ─────────────────────────────────────────────────────────

export function UploadStep({ maxBytes }: { maxBytes: number }) {
  const [state, formAction, pending] = useActionState(uploadImportAction, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <ErrorState title="That file could not be used" detail={state.error} />}

      <Card>
        {/*
          A label wrapping the drop zone, so clicking anywhere in it opens the
          picker and the whole thing is reachable by keyboard through the input
          — no `onClick` on a div pretending to be a button.
        */}
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (!dropped || !inputRef.current) return;
            // Assigning to `files` is what makes the dropped file part of the
            // form submission; a React state variable would not be.
            const transfer = new DataTransfer();
            transfer.items.add(dropped);
            inputRef.current.files = transfer.files;
            setFile(dropped);
          }}
          className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging
              ? "border-blue-400 bg-blue-50/50 dark:bg-blue-500/5"
              : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
          }`}
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <UploadIcon className="h-5 w-5" />
          </span>

          <span className="mt-3 text-[14px] font-medium text-slate-800 dark:text-slate-100">
            {file ? file.name : "Upload a CSV or Excel file"}
          </span>
          <span className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">
            {file
              ? `${formatBytes(file.size)} — click to choose a different file`
              : "Drag it here, or click to browse"}
          </span>

          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-slate-400">
          <span>
            CSV, XLS or XLSX · up to {formatBytes(maxBytes)} · first row must be the column headers
          </span>
          <Link
            href="/api/admin/imports/template"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Download the sample template
          </Link>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/admin/imports" className={BUTTON_STYLES.secondary}>
          Cancel
        </Link>
        <button type="submit" disabled={pending || !file} className={BUTTON_STYLES.primary}>
          {pending ? "Reading the file…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

// ── Step 2: column mapping ─────────────────────────────────────────────────

export function MappingStep({
  jobId,
  fileName,
  rowCount,
  columns,
  mapping,
  fields,
  sample,
}: {
  jobId: string;
  fileName: string;
  rowCount: number;
  columns: string[];
  mapping: Record<string, string>;
  fields: { key: string; label: string; required?: boolean; hint?: string }[];
  /** First few rows, so the operator can see what is actually in each column. */
  sample: Record<string, string>[];
}) {
  const [state, formAction, pending] = useActionState(saveMappingAction, undefined);
  const [current, setCurrent] = useState(mapping);

  const mappedKeys = new Set(Object.values(current).filter(Boolean));
  const missingRequired = fields.filter((field) => field.required && !mappedKeys.has(field.key));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="jobId" value={jobId} />

      {state?.error && <ErrorState title="Mapping is not complete" detail={state.error} />}

      <Card
        title="Match your columns to ours"
        description={`${fileName} — ${formatNumber(rowCount)} rows, ${columns.length} columns. We have guessed where we could; check them.`}
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                  Your column
                </th>
                <th className="px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                  Sample values
                </th>
                <th className="w-[240px] px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                  Maps to
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {columns.map((column) => {
                const value = current[column] ?? "";
                const samples = sample
                  .map((row) => row[column])
                  .filter((entry) => entry && entry.trim() !== "")
                  .slice(0, 2);

                return (
                  <tr key={column}>
                    <td className="px-4 py-2.5 align-top">
                      <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                        {column}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {samples.length === 0 ? (
                        <span className="text-[12px] italic text-slate-300 dark:text-slate-600">
                          empty in the first rows
                        </span>
                      ) : (
                        <span className="text-[12px] text-slate-500 dark:text-slate-400">
                          {samples.join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <select
                        name={`map:${column}`}
                        value={value}
                        onChange={(event) =>
                          setCurrent((entry) => ({ ...entry, [column]: event.target.value }))
                        }
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none transition dark:bg-slate-950 dark:text-white ${
                          value
                            ? "border-slate-200 focus:border-slate-400 dark:border-slate-700"
                            : "border-slate-200 text-slate-400 dark:border-slate-700"
                        }`}
                      >
                        <option value="">Ignore this column</option>
                        {fields.map((field) => (
                          <option
                            key={field.key}
                            value={field.key}
                            // Disabling a field already taken by another column
                            // makes the "two columns, one field" mistake
                            // unmakeable rather than merely rejected on submit.
                            disabled={mappedKeys.has(field.key) && value !== field.key}
                          >
                            {field.label}
                            {field.required ? " (required)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {missingRequired.length > 0 && (
        <ErrorState
          title="Two fields must be mapped before we can validate"
          detail={`Still unmapped: ${missingRequired.map((field) => field.label).join(", ")}.`}
        />
      )}

      <Card title="Options">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="createMissingUniversities"
            className="mt-0.5 h-[15px] w-[15px] rounded border-slate-300 dark:border-slate-600"
          />
          <span className="text-[13px] text-slate-700 dark:text-slate-200">
            Create universities named in the file but not yet in the system
            <span className="mt-0.5 block text-[12px] text-slate-400">
              Off by default. Leaving it off turns an unknown university into a row error you can
              see, rather than quietly creating a near-duplicate of one that already exists under a
              different spelling.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex justify-end gap-2 pb-6">
        <Link href="/admin/imports" className={BUTTON_STYLES.secondary}>
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending || missingRequired.length > 0}
          className={BUTTON_STYLES.primary}
        >
          {pending ? "Validating…" : "Validate rows"}
        </button>
      </div>
    </form>
  );
}

// ── Step 7: commit ─────────────────────────────────────────────────────────

export function CommitPanel({
  jobId,
  toCreate,
  toUpdate,
  toSkip,
  invalid,
}: {
  jobId: string;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  invalid: number;
}) {
  const [state, formAction, pending] = useActionState(commitImportAction, undefined);
  const [confirming, setConfirming] = useState(false);

  const total = toCreate + toUpdate;

  return (
    <div className="space-y-3">
      {state?.error && <ErrorState title="The import did not finish" detail={state.error} />}

      {invalid > 0 && (
        <InfoNote>
          {formatNumber(invalid)} rows have errors and will not be imported. Fix them in the file and
          run a second import, or continue and import the rest.
        </InfoNote>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={total === 0}
          className={`${BUTTON_STYLES.primary} w-full`}
        >
          {total === 0 ? "Nothing to import" : `Import ${formatNumber(total)} colleges`}
        </button>
      ) : (
        <form action={formAction} className="space-y-2.5">
          <input type="hidden" name="jobId" value={jobId} />
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-800/60">
            <p className="font-medium text-slate-800 dark:text-slate-100">
              Import {formatNumber(total)} colleges?
            </p>
            <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300">
              <li>· {formatNumber(toCreate)} created</li>
              <li>· {formatNumber(toUpdate)} existing records updated</li>
              <li>· {formatNumber(toSkip)} skipped</li>
              {invalid > 0 && <li>· {formatNumber(invalid)} not imported because of errors</li>}
            </ul>
            <p className="mt-1.5 text-slate-500 dark:text-slate-400">
              Every imported college starts unverified and goes into the verification queue.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${BUTTON_STYLES.secondary} flex-1`}
            >
              Back
            </button>
            <button type="submit" disabled={pending} className={`${BUTTON_STYLES.primary} flex-1`}>
              {pending ? "Importing…" : "Confirm import"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
