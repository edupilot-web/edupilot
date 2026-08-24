"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useSelection } from "@/components/admin/selection";
import { BUTTON_STYLES } from "@/components/admin/ui";

/**
 * The bar that appears when rows are selected (spec §32).
 *
 * Floats over the bottom of the viewport rather than sitting above the table:
 * an operator who has scrolled to row 180 to tick the last one should not have
 * to scroll back up to act on the selection.
 *
 * Destructive actions go through a confirmation that names the count and, for
 * the worst of them, requires the number to be typed. "Delete 240 colleges?"
 * with an OK button is a dialog people dismiss by reflex.
 */

export type BulkAction = {
  /** Sent as the `action` field, and matched by the server action. */
  key: string;
  label: string;
  /** Draws it in red and routes it through confirmation. */
  destructive?: boolean;
  /** Requires the selection count to be typed before the button enables. */
  requiresTypedCount?: boolean;
  /** Overrides the confirmation copy. */
  confirmTitle?: string;
  confirmBody?: string;
};

export type BulkState = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export function BulkBar({
  actions,
  action,
  entityLabel,
  entityLabelPlural,
}: {
  actions: BulkAction[];
  /** The Server Action that receives `action` and the selected `ids`. */
  action: (state: BulkState | undefined, formData: FormData) => Promise<BulkState>;
  entityLabel: string;
  entityLabelPlural: string;
}) {
  const selection = useSelection();
  const [state, formAction, pending] = useActionState(action, undefined);
  const [confirming, setConfirming] = useState<BulkAction | null>(null);
  const [typed, setTyped] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const count = selection?.selected.length ?? 0;

  /**
   * Clear the selection once the server reports success, so the bar does not
   * sit there offering to re-run an action on rows that have already changed.
   *
   * Read during render rather than reset in an effect: `state.ok` already tells
   * us the rows are stale, and an effect would render the populated bar once
   * more before emptying it.
   */
  const settled = state?.ok === true;
  if (settled && count > 0) {
    // Queued rather than called inline — a state update during another
    // component's render phase is not allowed.
    queueMicrotask(() => {
      selection?.clear();
      setConfirming(null);
      setTyped("");
    });
  }

  if (!selection || count === 0 || settled) {
    // A failure message must outlive the selection being cleared, or the
    // operator never learns why nothing happened.
    if (state?.error) {
      return (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <p
            role="alert"
            className="pointer-events-auto rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12.5px] font-medium text-rose-700 shadow-lg dark:border-rose-500/30 dark:bg-rose-950 dark:text-rose-300"
          >
            {state.error}
          </p>
        </div>
      );
    }
    return null;
  }

  const noun = count === 1 ? entityLabel : entityLabelPlural;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <form
          ref={formRef}
          action={formAction}
          className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 shadow-xl shadow-slate-900/20"
        >
          {selection.selected.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <input type="hidden" name="action" value={confirming?.key ?? ""} />

          <span className="px-1 text-[12.5px] font-medium text-white tabular-nums">
            {count} {noun} selected
          </span>

          <span aria-hidden="true" className="h-4 w-px bg-slate-700" />

          {actions.map((entry) => (
            <button
              key={entry.key}
              type={entry.destructive ? "button" : "submit"}
              name={entry.destructive ? undefined : "action"}
              value={entry.destructive ? undefined : entry.key}
              disabled={pending}
              onClick={entry.destructive ? () => setConfirming(entry) : undefined}
              className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 disabled:opacity-50 ${
                entry.destructive
                  ? "text-rose-300 hover:bg-rose-500/15"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              {entry.label}
            </button>
          ))}

          <span aria-hidden="true" className="h-4 w-px bg-slate-700" />

          <button
            type="button"
            onClick={selection.clear}
            className="rounded-md px-2 py-1 text-[12.5px] text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
          >
            Clear
          </button>

          {pending && <span className="px-1 text-[12px] text-slate-400">Working…</span>}
        </form>
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirming.confirmTitle ?? `${confirming.label} ${count} ${noun}?`}
          body={
            confirming.confirmBody ??
            `This affects ${count} ${noun} and is recorded in the audit log. It cannot be undone from this screen.`
          }
          confirmLabel={confirming.label}
          expected={confirming.requiresTypedCount ? String(count) : null}
          typed={typed}
          onTyped={setTyped}
          pending={pending}
          onCancel={() => {
            setConfirming(null);
            setTyped("");
          }}
          onConfirm={() => formRef.current?.requestSubmit()}
        />
      )}
    </>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  expected,
  typed,
  onTyped,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  /** When set, the operator must type this exact value to enable the button. */
  expected: string | null;
  typed: string;
  onTyped: (value: string) => void;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus starts inside the dialog rather than behind it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const ready = expected === null || typed.trim() === expected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-confirm-title"
        aria-describedby="bulk-confirm-body"
        className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2
          id="bulk-confirm-title"
          className="text-[15px] font-semibold text-slate-900 dark:text-white"
        >
          {title}
        </h2>
        <p
          id="bulk-confirm-body"
          className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400"
        >
          {body}
        </p>

        {expected !== null && (
          <label className="mt-4 block">
            <span className="text-[12.5px] text-slate-600 dark:text-slate-300">
              Type <span className="font-semibold tabular-nums">{expected}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(event) => onTyped(event.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] tabular-nums outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={BUTTON_STYLES.secondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready || pending}
            className={`${BUTTON_STYLES.primary} !bg-rose-600 !text-white hover:!bg-rose-700 disabled:!bg-rose-300`}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
