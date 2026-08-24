"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Row selection for the data tables.
 *
 * A client island wrapped around a server-rendered table: the provider and the
 * checkboxes are client components, the rows between them are not. React Server
 * Components pass through a client component's `children` untouched, so the
 * table markup stays on the server and only the ~2KB of selection logic ships.
 *
 * Selection is *not* in the URL, unlike every other piece of table state. It is
 * ephemeral by nature — nobody wants to share a link that pre-ticks 40 rows —
 * and a hundred ids in a querystring would breach header limits.
 */
type SelectionContextValue = {
  selected: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  /** Ids on the current page, which is the most "all" can ever mean. */
  pageIds: string[];
  allSelected: boolean;
  someSelected: boolean;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionScope({
  pageIds,
  children,
}: {
  pageIds: string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const everyOne = pageIds.every((id) => current.includes(id));
      if (everyOne) return current.filter((id) => !pageIds.includes(id));
      return [...new Set([...current, ...pageIds])];
    });
  }, [pageIds]);

  const clear = useCallback(() => setSelected([]), []);

  const value = useMemo<SelectionContextValue>(() => {
    const onPage = pageIds.filter((id) => selectedSet.has(id));
    return {
      selected,
      isSelected: (id: string) => selectedSet.has(id),
      toggle,
      toggleAll,
      clear,
      pageIds,
      allSelected: pageIds.length > 0 && onPage.length === pageIds.length,
      someSelected: onPage.length > 0 && onPage.length < pageIds.length,
    };
  }, [selected, selectedSet, pageIds, toggle, toggleAll, clear]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/**
 * Returns null outside a `SelectionScope`, so a table that does not offer bulk
 * actions can render the same row component without a provider.
 */
export function useSelection(): SelectionContextValue | null {
  return useContext(SelectionContext);
}

const CHECKBOX =
  "h-[15px] w-[15px] cursor-pointer appearance-none rounded-[4px] border border-slate-300 bg-white outline-none transition checked:border-slate-900 checked:bg-slate-900 indeterminate:border-slate-900 indeterminate:bg-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-600 dark:bg-slate-900 dark:checked:border-white dark:checked:bg-white";

function CheckGlyph({ dash }: { dash?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 text-white dark:text-slate-900"
    >
      <path
        d={dash ? "M2.5 6h7" : "M2 6.2 4.6 8.8 10 3.4"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SelectAllCheckbox({ label = "Select all rows" }: { label?: string }) {
  const selection = useSelection();
  if (!selection) return null;

  const checked = selection.allSelected;
  const indeterminate = selection.someSelected;

  return (
    <span className="relative inline-flex h-[15px] w-[15px] items-center justify-center">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        // `indeterminate` is a DOM property with no HTML attribute, so it is set
        // through a ref callback rather than declared in JSX.
        ref={(node) => {
          if (node) node.indeterminate = !checked && indeterminate;
        }}
        onChange={selection.toggleAll}
        className={CHECKBOX}
      />
      {(checked || indeterminate) && <CheckGlyph dash={!checked && indeterminate} />}
    </span>
  );
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const selection = useSelection();
  if (!selection) return null;

  const checked = selection.isSelected(id);

  return (
    <span className="relative inline-flex h-[15px] w-[15px] items-center justify-center">
      <input
        type="checkbox"
        aria-label={`Select ${label}`}
        checked={checked}
        onChange={() => selection.toggle(id)}
        className={CHECKBOX}
      />
      {checked && <CheckGlyph />}
    </span>
  );
}
