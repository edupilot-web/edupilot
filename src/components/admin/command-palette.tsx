"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { ADMIN_NAV_ITEMS } from "@/lib/admin/nav";
import { hasAnyPermission } from "@/lib/admin/permissions";

/**
 * Global search and the command palette, which are the same thing (spec §31).
 *
 * Opens on ⌘K / Ctrl-K. Typing matches navigation destinations locally and, in
 * parallel, searches real records on the server. Destinations answer instantly
 * from a list that is already in memory; records arrive when they arrive. An
 * operator who types "colleges" to navigate should not wait on a database round
 * trip to get there.
 */

type SearchHit = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  href: string;
};

type Group = { heading: string; items: { key: string; title: string; subtitle: string | null; href: string }[] };

const DEBOUNCE_MS = 180;
const MIN_QUERY = 2;

export function CommandPalette({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ term: string; results: SearchHit[] }>({
    term: "",
    results: [],
  });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => setOpen(true), []);

  /**
   * Closing clears the query here rather than in an effect watching `open`.
   *
   * Resetting in an effect means an extra render pass every time the dialog
   * closes, to undo state the closing interaction already knew it was
   * discarding. Every path that closes the palette goes through this.
   */
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits({ term: "", results: [] });
    setActive(0);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => {
          if (current) {
            // Defer the reset so it is not a setState inside another updater.
            queueMicrotask(close);
            return current;
          }
          return true;
        });
      }
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  // Focus once the dialog has painted, or the caret lands nowhere.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const term = query.trim();
  const settled = hits.term === term;

  useEffect(() => {
    if (!open || term.length < MIN_QUERY || settled) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { data?: { results?: SearchHit[] } };
        setHits({ term, results: body.data?.results ?? [] });
      } catch (err) {
        if (controller.signal.aborted) return;
        // Navigation still works from the local list; a failed record search
        // must not empty the palette.
        console.error("[admin] global search failed:", err);
        setHits({ term, results: [] });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, term, settled]);

  const navMatches = useMemo(() => {
    const allowed = ADMIN_NAV_ITEMS.filter((item) =>
      hasAnyPermission(permissions, item.permissions)
    );
    if (!term) return allowed.filter((item) => item.built).slice(0, 7);

    const needle = term.toLowerCase();
    return allowed
      .filter(
        (item) =>
          item.label.toLowerCase().includes(needle) ||
          item.section.toLowerCase().includes(needle) ||
          item.keywords?.some((keyword) => keyword.includes(needle))
      )
      .slice(0, 6);
  }, [term, permissions]);

  const groups = useMemo<Group[]>(() => {
    const result: Group[] = [];

    if (navMatches.length > 0) {
      result.push({
        heading: term ? "Go to" : "Jump to",
        items: navMatches.map((item) => ({
          key: `nav:${item.href}`,
          title: item.label,
          subtitle: item.section,
          href: item.href,
        })),
      });
    }

    if (settled) {
      const byType = new Map<string, SearchHit[]>();
      for (const hit of hits.results) {
        const list = byType.get(hit.type) ?? [];
        list.push(hit);
        byType.set(hit.type, list);
      }
      for (const [type, list] of byType) {
        result.push({
          heading: type,
          items: list.map((hit) => ({
            key: `${hit.type}:${hit.id}`,
            title: hit.title,
            subtitle: hit.subtitle,
            href: hit.href,
          })),
        });
      }
    }

    return result;
  }, [navMatches, hits, settled, term]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  function go(href: string) {
    close();
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (flat.length ? (current + 1) % flat.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (flat.length ? (current - 1 + flat.length) % flat.length : 0));
    } else if (event.key === "Enter" && flat[active]) {
      event.preventDefault();
      go(flat[active].href);
    }
  }

  const searching = term.length >= MIN_QUERY && !settled;

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="flex w-full max-w-[300px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12.5px] text-slate-400 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
      >
        <SearchIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Search colleges, students, anything…</span>
        <kbd className="hidden rounded border border-slate-200 bg-white px-1 py-px font-sans text-[10px] text-slate-400 sm:inline dark:border-slate-600 dark:bg-slate-900">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-3.5 dark:border-slate-800">
              <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search colleges, universities, students, admins…"
                aria-label="Search the admin application"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-results"
                className="flex-1 bg-transparent py-3 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
              {searching && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin text-slate-300" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                  <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
            </div>

            <div id="palette-results" role="listbox" className="max-h-[52vh] overflow-y-auto py-1.5">
              {flat.length === 0 && (
                <p className="px-4 py-8 text-center text-[13px] text-slate-400">
                  {term.length < MIN_QUERY
                    ? "Type at least two characters."
                    : searching
                      ? "Searching…"
                      : `Nothing matches “${term}”.`}
                </p>
              )}

              {groups.map((group) => (
                <div key={group.heading}>
                  <p className="px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    {group.heading}
                  </p>
                  {group.items.map((item) => {
                    const index = flat.findIndex((entry) => entry.key === item.key);
                    const isActive = index === active;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(item.href)}
                        className={`flex w-full items-baseline gap-2 px-3.5 py-1.5 text-left transition ${
                          isActive ? "bg-slate-100 dark:bg-slate-800" : ""
                        }`}
                      >
                        <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="ml-auto shrink-0 truncate text-[11.5px] text-slate-400">
                            {item.subtitle}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 border-t border-slate-100 px-3.5 py-1.5 text-[11px] text-slate-400 dark:border-slate-800">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
