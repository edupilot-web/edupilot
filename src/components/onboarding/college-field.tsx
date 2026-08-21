"use client";

import { useEffect, useState } from "react";
import { Combobox, ComboboxNote, type ComboboxOption } from "@/components/onboarding/combobox";
import { SearchIcon } from "@/components/icons";

type CollegeSearchResponse = {
  data?: { colleges?: { id: string; name: string; location: string | null }[] };
};

/** Long enough that a fast typist does not fire a request per character. */
const DEBOUNCE_MS = 220;

/** The shortest query the server will answer; below this there is nothing to show. */
const MIN_QUERY = 2;

/**
 * The college search field.
 *
 * Submits two values: `collegeName`, always, and `collegeId` when the student
 * picked a directory entry. Choosing from the list is a convenience, not a
 * requirement — a name with no id is saved as typed and added to the directory
 * server-side, so the next person to look for it finds it.
 */
export function CollegeField({
  defaults,
  errors,
}: {
  defaults: { collegeId: string; collegeName: string };
  errors?: string[];
}) {
  const [query, setQuery] = useState(defaults.collegeName);
  const [collegeId, setCollegeId] = useState(defaults.collegeId);

  /**
   * Results together with the term they answer.
   *
   * Pairing the two is what makes "are we still waiting?" a derived value
   * rather than a second piece of state — no spinner flag to set on the way in
   * and forget on one of the ways out, and no result from an earlier keystroke
   * repopulating the list after the user has typed on.
   */
  const [results, setResults] = useState<{ term: string; options: ComboboxOption[] }>({
    term: defaults.collegeName.trim(),
    options: [],
  });

  const term = query.trim();
  const settled = results.term === term;
  const options = settled ? results.options : [];
  const loading = term.length >= MIN_QUERY && !settled;

  useEffect(() => {
    if (term.length < MIN_QUERY || settled) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/colleges/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`search failed: ${response.status}`);

        const body = (await response.json()) as CollegeSearchResponse;
        setResults({
          term,
          options: (body.data?.colleges ?? []).map((college) => ({
            id: college.id,
            label: college.name,
            hint: college.location,
          })),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        // A failed lookup must not block the field: the student can still type
        // the name, which is the whole point of allowing free text.
        console.error("[onboarding] college search failed:", err);
        setResults({ term, options: [] });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, settled]);

  return (
    <>
      <input type="hidden" name="collegeName" value={term} />
      <input type="hidden" name="collegeId" value={collegeId} />

      <Combobox
        label="College / University"
        icon={<SearchIcon />}
        placeholder="Search your college…"
        value={query}
        onChange={(value) => {
          setQuery(value);
          // Typing over a chosen college detaches it: the id no longer
          // describes what is in the box.
          setCollegeId("");
        }}
        onSelect={(option) => {
          setCollegeId(option.id);
          // The chosen label becomes the query. Marking it as already answered
          // stops a pointless round trip for a term we just showed results for.
          setResults({ term: option.label.trim(), options });
        }}
        options={options}
        loading={loading}
        errors={errors}
        hint="Start typing and pick yours, or just enter the full name."
        emptyState={
          <ComboboxNote>
            Can&apos;t find your college? Keep typing the full name — we&apos;ll add it for you.
          </ComboboxNote>
        }
        autoFocus
      />
    </>
  );
}
