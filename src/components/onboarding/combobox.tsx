"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, SearchIcon } from "@/components/icons";
import { FieldError } from "@/components/auth/fields";

const LABEL = "mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300";

const INPUT_BASE =
  "w-full rounded-lg border bg-white py-2.5 pr-3 text-[15px] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 disabled:opacity-60 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500";

const INPUT_IDLE =
  "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:focus:border-blue-500";

const INPUT_INVALID =
  "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 dark:border-rose-500/60";

export type ComboboxOption = {
  /** Stable identity. Free-text entries use the text itself. */
  id: string;
  label: string;
  /** Second line under the label, e.g. a city. */
  hint?: string | null;
};

/**
 * Text input with a suggestion list, for fields where the good answers are
 * known but the list can never be complete.
 *
 * Typing is always allowed and never overruled: the value the student typed is
 * what gets submitted unless they pick something. Forcing a selection is the
 * failure mode this exists to avoid — a student whose college is missing would
 * otherwise have to name a different one.
 *
 * Built on a plain input rather than a listbox widget so the browser's own
 * autofill and mobile keyboards keep working; ARIA combobox roles are applied
 * on top for screen readers.
 */
export function Combobox({
  label,
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  hint,
  loading = false,
  emptyState,
  errors,
  icon,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Called when a suggestion is chosen, rather than typed over. */
  onSelect?: (option: ComboboxOption) => void;
  options: ComboboxOption[];
  placeholder?: string;
  hint?: string;
  loading?: boolean;
  /** Shown under the list when the query found nothing. */
  emptyState?: ReactNode;
  errors?: string[];
  icon?: ReactNode;
  autoFocus?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = Boolean(errors?.length);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when focus or a click lands outside. `pointerdown` rather than
  // `click`, so choosing an option is not raced by the close.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const showEmpty = open && !loading && options.length === 0 && value.trim().length >= 2;
  const showList = open && (options.length > 0 || loading || showEmpty);

  function choose(option: ComboboxOption) {
    onChange(option.label);
    onSelect?.(option);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => {
        const nextIndex = current + delta;
        if (nextIndex < 0) return options.length - 1;
        if (nextIndex >= options.length) return 0;
        return nextIndex;
      });
      return;
    }

    if (event.key === "Enter" && open && active >= 0 && options[active]) {
      // Only swallow Enter when it is choosing something. Otherwise the form
      // must still submit, as it would from any other field.
      event.preventDefault();
      choose(options[active]);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div ref={containerRef}>
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
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : hint ? hintId : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`${INPUT_BASE} ${invalid ? INPUT_INVALID : INPUT_IDLE} ${icon ? "pl-10" : "pl-3.5"}`}
        />

        {loading && (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
          >
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
            <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}

        {showList && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-900">
            {options.length > 0 && (
              <ul id={listId} role="listbox" aria-label={label} className="max-h-[236px] overflow-y-auto py-1">
                {options.map((option, index) => (
                  <li key={option.id} id={`${id}-option-${index}`} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      // `mousedown` fires before the input's blur, so the value
                      // is set before anything can close the list underneath.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option);
                      }}
                      onMouseEnter={() => setActive(index)}
                      className={`flex w-full items-start gap-2 px-3.5 py-2.5 text-left transition ${
                        index === active ? "bg-blue-50 dark:bg-blue-500/10" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-slate-800 dark:text-slate-100">
                          {option.label}
                        </span>
                        {option.hint && (
                          <span className="mt-0.5 block truncate text-[12px] text-slate-400 dark:text-slate-500">
                            {option.hint}
                          </span>
                        )}
                      </span>
                      {value === option.label && (
                        <CheckIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {loading && options.length === 0 && (
              <p className="px-3.5 py-3 text-[13px] text-slate-400 dark:text-slate-500">Searching…</p>
            )}

            {showEmpty && emptyState && (
              <div className="border-t border-slate-100 px-3.5 py-3 dark:border-slate-800">{emptyState}</div>
            )}
          </div>
        )}
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

/** The magnifier used by the college field, re-exported so pages need one import. */
export function ComboboxSearchIcon() {
  return <SearchIcon />;
}

/** Small inline note used inside `emptyState`. */
export function ComboboxNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
      <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>{children}</span>
    </p>
  );
}
