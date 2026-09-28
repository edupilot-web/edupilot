/**
 * How a topic is named and identified.
 *
 * Three different identities, and conflating any two of them causes a real
 * problem:
 *
 *   `_id`          routing, progress, AI history. Never derived from the title,
 *                  because §58 requires a renamed topic to keep its history.
 *   `slug`         the natural key inside one subject. A re-materialisation
 *                  upserts on it, so a re-run converges instead of doubling the
 *                  syllabus.
 *   `canonicalKey` "the same topic, elsewhere". Derived from the title alone,
 *                  so two colleges teaching Linked Lists collide deliberately —
 *                  which is what lets prepared content be written once and
 *                  reused across curricula (§55).
 *
 * Pure functions with no imports, so the seeder, the admin importer and the
 * model layer all produce the same strings. Two implementations of this would
 * disagree on the first title containing a hyphen, and the disagreement would
 * show up as duplicate topics rather than as an error.
 */

/** URL-safe form of a title, scoped to its subject. */
export function topicSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    // Strip the combining marks NFKD just separated out, so "Fourier" and
    // "Fouríer" do not become two topics.
    .replace(/[̀-ͯ]/g, "")
    /**
     * Punctuation becomes a *space*, not nothing.
     *
     * Syllabus titles are full of it — "Stack ADT and array/linked
     * implementations", "Singly linked lists: insertion, deletion, traversal".
     * Deleting the slash would fuse "array/linked" into "arraylinked", which is
     * a word no other spelling of that title produces, so the canonical key
     * stops matching across colleges and prepared content silently fails to
     * reach half of them.
     */
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

/**
 * Words that appear in a topic title without distinguishing it.
 *
 * Short by construction. Every word removed is a way for two *different* topics
 * to collide, and a collision here means one college's prepared content being
 * shown on another's topic. "Introduction to Pointers" and "Pointers" are the
 * same topic; "Types of Lasers" and "Lasers" are near enough that sharing an
 * explanation is right. Nothing that could be a distinction is on this list.
 */
const CANONICAL_NOISE = new Set([
  "introduction",
  "intro",
  "to",
  "the",
  "a",
  "an",
  "of",
  "and",
  "basics",
  "basic",
  "overview",
  "fundamentals",
  "concept",
  "concepts",
]);

/**
 * A college-independent identity for a topic.
 *
 * Nothing joins on it and nothing is authorised by it — it is a *lookup* key
 * for reusable content and an aggregation key for "most asked topics" (§53).
 * That is deliberate: if it were a foreign key, a bad collision would merge two
 * colleges' curriculum rows, and here the worst case is a shared explanation
 * that a reviewer can unpick.
 *
 * A singular form is not derived. Stemming "Trees" to "Tree" would also stem
 * "Series" to "Seri", and the classes of English noun this would get wrong are
 * exactly the ones engineering syllabi are full of.
 */
export function canonicalTopicKey(title: string): string {
  const words = topicSlug(title)
    .split("-")
    .filter((word) => word && !CANONICAL_NOISE.has(word));

  // Falls back to the full slug when a title is *only* noise
  // ("Introduction", "Overview"), so the key is never empty.
  return (words.join("-") || topicSlug(title)).slice(0, 160);
}

/**
 * A rough reading time for a topic, from its title and how much sits under it.
 *
 * A guess, and presented as one ("about 20 min"). It exists because a topic
 * list with no time estimate gives a student no way to plan an evening, and a
 * wrong-by-five-minutes estimate is far more useful than none. Real timings can
 * replace it per topic whenever anyone measures them.
 */
export function estimateTopicMinutes(input: {
  subtopicCount: number;
  difficulty: "basic" | "intermediate" | "advanced";
}): number {
  const base = { basic: 15, intermediate: 25, advanced: 35 }[input.difficulty];
  return Math.min(180, base + input.subtopicCount * 5);
}

/**
 * Difficulty from where a topic sits in the course.
 *
 * Later units are harder. Crude, and honest about it — it is a default a
 * content team overrides, not a judgement the platform is asserting. The
 * alternative was leaving every topic at "basic", which tells a student
 * nothing and makes the filter useless.
 */
export function difficultyForUnit(
  unitNumber: number | null,
  totalUnits: number
): "basic" | "intermediate" | "advanced" {
  if (unitNumber === null || totalUnits <= 1) return "basic";

  const position = unitNumber / totalUnits;
  if (position <= 0.4) return "basic";
  if (position <= 0.75) return "intermediate";
  return "advanced";
}
