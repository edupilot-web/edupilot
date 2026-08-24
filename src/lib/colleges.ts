import { connectDB } from "@/lib/db";
import { College, normalizeCollegeName } from "@/models/College";

export type CollegeSuggestion = {
  id: string;
  name: string;
  /** "Visakhapatnam, Andhra Pradesh", or null when we hold no location. */
  location: string | null;
};

const MAX_RESULTS = 8;

/**
 * Autocomplete for the college field.
 *
 * Reads the same `colleges` collection the admin app administers — one
 * directory, not a student copy and an admin copy. Archived and suspended rows
 * are excluded, so retiring a college in the admin stops it being offered here
 * without touching the profiles that already point at it.
 *
 * Ranks a prefix match above a match anywhere in the name, so typing "andhra"
 * offers "Andhra University" before a college that merely sits in Andhra
 * Pradesh. Both queries run against `normalizedName`, which is what lets
 * "st xaviers" find the college spelled with a full stop and an apostrophe.
 */
export async function searchColleges(query: string): Promise<CollegeSuggestion[]> {
  const normalized = normalizeCollegeName(query);
  // One letter would return an arbitrary slice of the directory.
  if (normalized.length < 2) return [];

  await connectDB();

  const escaped = escapeRegex(normalized);
  const prefix = new RegExp(`^${escaped}`);
  const anywhere = new RegExp(escaped);

  const [starts, contains] = await Promise.all([
    College.find({ normalizedName: prefix, status: "active" })
      .select("name cityName districtName stateName")
      .sort({ normalizedName: 1 })
      .limit(MAX_RESULTS)
      .lean(),
    College.find({ normalizedName: anywhere, status: "active" })
      .select("name cityName districtName stateName")
      .sort({ normalizedName: 1 })
      .limit(MAX_RESULTS)
      .lean(),
  ]);

  const seen = new Set<string>();
  const results: CollegeSuggestion[] = [];

  for (const college of [...starts, ...contains]) {
    const id = String(college._id);
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({
      id,
      name: college.name,
      location:
        [college.cityName ?? college.districtName, college.stateName]
          .filter(Boolean)
          .join(", ") || null,
    });
    if (results.length === MAX_RESULTS) break;
  }

  return results;
}

/** A user-supplied string is going into a RegExp; neutralise the metacharacters. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
