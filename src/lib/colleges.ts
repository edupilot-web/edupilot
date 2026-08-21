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
    College.find({ normalizedName: prefix })
      .select("name city state")
      .sort({ normalizedName: 1 })
      .limit(MAX_RESULTS)
      .lean(),
    College.find({ normalizedName: anywhere })
      .select("name city state")
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
      location: [college.city, college.state].filter(Boolean).join(", ") || null,
    });
    if (results.length === MAX_RESULTS) break;
  }

  return results;
}

/** A user-supplied string is going into a RegExp; neutralise the metacharacters. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
