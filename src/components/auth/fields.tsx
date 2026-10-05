"use client";

import { useId, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, ChevronDownIcon, EyeIcon, EyeOffIcon } from "@/components/icons";

export const LABEL = "mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300";

const INPUT_BASE =
  "w-full rounded-lg border bg-white py-2.5 pr-3 text-[15px] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 disabled:opacity-60 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500";

const INPUT_IDLE =
  "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:focus:border-blue-500";

const INPUT_INVALID =
  "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 dark:border-rose-500/60";

/**
 * For inputs this file cannot own — the teacher college combobox, which needs
 * its own focus and keyboard handling.
 *
 * Exported rather than copied so there is one description of what an input in
 * this product looks like. The teacher forms carried a parallel copy that had
 * no dark variants, and the difference only showed up once they were rendered
 * beside the student ones.
 */
export const INPUT_PLAIN = `${INPUT_BASE} ${INPUT_IDLE} pl-3.5`;

/** A value the visitor may read but not change — fixed by an invitation. */
export const INPUT_READONLY =
  "w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-3.5 pr-3 text-[15px] text-slate-500 outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400";

/** Renders the first message for a field; the rest are redundant in practice. */
export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1 text-[12px] font-medium text-rose-600 dark:text-rose-400">
      <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
      {messages[0]}
    </p>
  );
}

/** Form-level banner for failures that belong to no single field. */
export function FormMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
    >
      <AlertIcon className="mt-px h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}

type BaseFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  icon?: ReactNode;
  hint?: string;
  errors?: string[];
};

export function TextField({
  label,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  icon,
  hint,
  errors,
  type = "text",
  readOnly,
}: BaseFieldProps & {
  type?: "text" | "email";
  /**
   * Fixed by something the visitor cannot argue with — an invitation naming
   * the mailbox it was issued to. Read-only rather than disabled: a disabled
   * input is skipped by the keyboard and not read out, and this is a value the
   * person needs to be able to check.
   */
  readOnly?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = Boolean(errors?.length);

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {icon}
          </span>
        )}
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          readOnly={readOnly}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : hint ? hintId : undefined}
          className={
            readOnly
              ? `${INPUT_READONLY} ${icon ? "pl-10" : ""}`
              : `${INPUT_BASE} ${invalid ? INPUT_INVALID : INPUT_IDLE} ${icon ? "pl-10" : "pl-3.5"}`
          }
        />
      </div>
      {hint && !invalid && (
        <p id={hintId} className="mt-1.5 text-[12px] text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
      <FieldError id={errorId} messages={errors} />
    </div>
  );
}

/** Password input with a show/hide toggle, matching the eye affordance in the design. */
export function PasswordField({
  label,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  icon,
  hint,
  errors,
  children,
}: BaseFieldProps & { children?: ReactNode }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);
  const invalid = Boolean(errors?.length);

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {icon}
          </span>
        )}
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : hint ? hintId : undefined}
          className={`${INPUT_BASE} ${invalid ? INPUT_INVALID : INPUT_IDLE} ${icon ? "pl-10" : "pl-3.5"} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:text-slate-200"
        >
          {visible ? <EyeOffIcon className="h-[18px] w-[18px]" /> : <EyeIcon className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {children}
      {hint && !invalid && (
        <p id={hintId} className="mt-1.5 text-[12px] text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
      <FieldError id={errorId} messages={errors} />
    </div>
  );
}

export function CheckboxField({
  name,
  checked,
  onChange,
  errors,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  errors?: string[];
  children: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer select-none items-start gap-2.5">
        <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <input
            id={id}
            name={name}
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            aria-invalid={errors?.length ? true : undefined}
            aria-describedby={errors?.length ? errorId : undefined}
            className="peer h-full w-full cursor-pointer appearance-none rounded-[5px] border border-slate-300 bg-white outline-none transition checked:border-blue-600 checked:bg-blue-600 focus-visible:ring-4 focus-visible:ring-blue-500/15 aria-[invalid]:border-rose-400 dark:border-slate-600 dark:bg-slate-900"
          />
          <CheckIcon className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
        </span>
        <span className="text-[13px] leading-[18px] text-slate-600 dark:text-slate-400">{children}</span>
      </label>
      <FieldError id={errorId} messages={errors} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  hint,
  errors,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  errors?: string[];
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = Boolean(errors?.length);

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : hint ? hintId : undefined}
          className={`${INPUT_BASE} ${invalid ? INPUT_INVALID : INPUT_IDLE} appearance-none pl-3.5 pr-10 ${
            value ? "" : "text-slate-400 dark:text-slate-500"
          }`}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} className="text-slate-900">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
      </div>
      {hint && !invalid && (
        <p id={hintId} className="mt-1.5 text-[12px] text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
      <FieldError id={errorId} messages={errors} />
    </div>
  );
}
