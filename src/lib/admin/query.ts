/**
 * Turning a URL into a database query, and back again.
 *
 * Every admin table keeps its entire state — search, filters, sort, page — in
 * the querystring. That is what makes a filtered view linkable, bookmarkable,
 * shareable in chat, saveable as a Saved View, and re-runnable as an export
 * with exactly the rows the operator was looking at. Table state held in React
 * would be none of those things.
 *
 * Everything here is server-side. The client sends a URL; the server decides
 * what it means. A filter the browser could bypass is not a filter.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** Page sizes offered in the footer. Anything else in the URL is clamped. */
export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Hard ceiling on how deep a page can be requested.
 *
 * `skip` degrades linearly, so page 40,000 of a million-row collection is a
 * query that ties up the primary for seconds. Nobody paginates to row two
 * million by hand — a request that deep is a crawler or a mistake, and the
 * honest answer is to refuse and suggest filtering.
 */
export const MAX_PAGE = 500;

export function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Multi-select filters arrive as repeated keys, or one comma-separated value. */
export function readList(params: SearchParams, key: string): string[] {
  const value = params[key];
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * A multi-select filter narrowed to the values a schema actually allows.
 *
 * Every filter value arrives from a querystring, which anyone can edit. Passing
 * an unrecognised string through to Mongo is not a security hole on its own —
 * it simply matches nothing — but it defeats the schema's typing, and a filter
 * that silently means "no rows" is worse than one that means "no filter". This
 * drops what the enum does not contain, so the result is either a real filter
 * or no filter at all.
 */
export function readEnumList<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[]
): T[] {
  const permitted = new Set<string>(allowed);
  return readList(params, key).filter((value): value is T => permitted.has(value));
}

export type Pagination = {
  page: number;
  limit: number;
  skip: number;
};

export function readPagination(params: SearchParams): Pagination {
  const rawPage = Number(readParam(params, "page") ?? 1);
  const rawLimit = Number(readParam(params, "limit") ?? DEFAULT_PAGE_SIZE);

  // `Number("abc")` is NaN, and NaN survives Math.max to reach `.skip()`, where
  // it fails as a 500 rather than a bad request. Guard before clamping.
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(Math.trunc(rawPage), 1), MAX_PAGE) : 1;
  const limit = (PAGE_SIZES as readonly number[]).includes(rawLimit)
    ? rawLimit
    : DEFAULT_PAGE_SIZE;

  return { page, limit, skip: (page - 1) * limit };
}

export type SortSpec = { field: string; direction: 1 | -1 };

/**
 * `?sort=name` ascending, `?sort=-updatedAt` descending.
 *
 * `allowed` is a whitelist, not a suggestion: sorting is a database operation
 * chosen by the caller, and an unindexed field in that position is a collection
 * scan a URL can trigger.
 */
export function readSort(
  params: SearchParams,
  allowed: readonly string[],
  fallback: SortSpec
): SortSpec {
  const raw = readParam(params, "sort");
  if (!raw) return fallback;

  const direction: 1 | -1 = raw.startsWith("-") ? -1 : 1;
  const field = raw.replace(/^-/, "");
  if (!allowed.includes(field)) return fallback;

  return { field, direction };
}

/** Mongo sort object, with `_id` appended as a tiebreak. */
export function toMongoSort(sort: SortSpec): Record<string, 1 | -1> {
  // Without a unique tiebreak, two rows with the same `updatedAt` can swap
  // between pages, so an operator paging through sees one twice and misses
  // another. `_id` is unique and always indexed.
  return { [sort.field]: sort.direction, _id: sort.direction };
}

/**
 * Builds an href with `changes` applied to the current parameters.
 *
 * `null` removes a key. Any change other than the page itself resets to page 1,
 * because staying on page 7 of a result set that just shrank to two pages shows
 * an empty table that reads as "no results".
 */
export function buildHref(
  basePath: string,
  params: SearchParams,
  changes: Record<string, string | string[] | number | null | undefined>
): string {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry !== "") next.append(key, entry);
    }
  }

  const resetsPage = Object.keys(changes).some((key) => key !== "page");

  for (const [key, value] of Object.entries(changes)) {
    next.delete(key);
    if (value === null || value === undefined || value === "") continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      next.append(key, String(entry));
    }
  }

  if (resetsPage && !("page" in changes)) next.delete("page");

  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Toggles one value in a multi-select filter. */
export function toggleValueHref(
  basePath: string,
  params: SearchParams,
  key: string,
  value: string
): string {
  const current = readList(params, key);
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return buildHref(basePath, params, { [key]: next.length ? next.join(",") : null });
}

/** The sort link for a column header: same field flips direction, new field starts ascending. */
export function sortHref(
  basePath: string,
  params: SearchParams,
  field: string,
  current: SortSpec
): string {
  const nextDirection = current.field === field && current.direction === 1 ? "-" : "";
  return buildHref(basePath, params, { sort: `${nextDirection}${field}` });
}

/** Filter keys, so "Clear filters" knows what to drop and the chip row what to show. */
export function activeFilterCount(params: SearchParams, keys: readonly string[]): number {
  return keys.filter((key) => readList(params, key).length > 0).length;
}

export function clearFiltersHref(
  basePath: string,
  params: SearchParams,
  keys: readonly string[]
): string {
  const changes: Record<string, null> = {};
  for (const key of keys) changes[key] = null;
  return buildHref(basePath, params, { ...changes, q: null, page: null });
}

/**
 * A case-insensitive "contains" regex, with the input neutralised.
 *
 * User text on its way into a RegExp: an unescaped `(` is a syntax error and a
 * `.*.*.*` is a query that takes the database down with it.
 */
export function containsRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/** Ceiling division that does not return 0 for an empty result set. */
export function pageCount(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

/**
 * A date filter expressed as a preset — `7d`, `30d`, `3m`, `12m` — or a
 * `from..to` pair. Returns a Mongo range, or null when nothing was asked for.
 */
export function readDateRange(
  params: SearchParams,
  key: string
): { $gte?: Date; $lte?: Date } | null {
  const raw = readParam(params, key);
  if (!raw) return null;

  const presets: Record<string, number> = {
    today: 1,
    "7d": 7,
    "30d": 30,
    "3m": 90,
    "6m": 180,
    "12m": 365,
  };

  if (raw in presets) {
    const from = new Date();
    from.setDate(from.getDate() - presets[raw]);
    from.setHours(0, 0, 0, 0);
    return { $gte: from };
  }

  const [fromRaw, toRaw] = raw.split("..");
  const range: { $gte?: Date; $lte?: Date } = {};

  const from = fromRaw ? new Date(fromRaw) : null;
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;

  const to = toRaw ? new Date(toRaw) : null;
  if (to && !Number.isNaN(to.getTime())) {
    // An end date means "to the end of that day", not "to midnight at its start".
    to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }

  return Object.keys(range).length ? range : null;
}

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
] as const;
