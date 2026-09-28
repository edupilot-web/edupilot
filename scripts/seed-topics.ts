/**
 * Materialises `Topic` rows from the syllabus already in `CurriculumSubject`,
 * and attaches the authored learning content in `seed-data/topic-content.ts`.
 *
 * The syllabus stays the source of truth. This script **reads**
 * `units[].topics[]` and writes one addressable row per title; it never invents
 * a topic, never renames one, and never touches the subject document. Run it
 * again after an administrator edits a syllabus and it converges: new titles
 * appear, existing ones keep their ids (and therefore their progress and their
 * AI history, §58), and titles that have gone are **archived rather than
 * deleted** — a student's history must survive a curriculum edit, and a delete
 * would orphan every interaction pointing at it.
 *
 * Content is matched by canonical key, so one authored explanation reaches the
 * same topic under every college and regulation that teaches it (§55).
 *
 * Run with:  npm run seed:topics
 *            npm run seed:topics -- --subject CS201
 *            npm run seed:topics -- --dry-run
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { CurriculumSubject } from "../src/models/Curriculum";
import { Topic, TopicContent } from "../src/models/Topic";
import {
  canonicalTopicKey,
  difficultyForUnit,
  estimateTopicMinutes,
  topicSlug,
} from "../src/lib/learning/topic-identity";
import { SEED_TOPIC_CONTENT } from "./seed-data/topic-content";

function readArg(name: string): string | null {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : null;
}

const DRY_RUN = process.argv.includes("--dry-run");
const SUBJECT_CODE = readArg("subject");

type Counters = {
  subjects: number;
  topicsCreated: number;
  topicsUpdated: number;
  topicsArchived: number;
  contentWritten: number;
  contentSkipped: number;
};

async function main() {
  await connectDB();

  const filter: Record<string, unknown> = { status: "active" };
  if (SUBJECT_CODE) filter.code = SUBJECT_CODE.toUpperCase();

  const subjects = await CurriculumSubject.find(filter)
    .select("_id name code units collegeName regulationCode branchName")
    .lean();

  if (!subjects.length) {
    console.log("No curriculum subjects found. Run `npm run seed:curriculum` first.");
    return;
  }

  const contentByKey = new Map(SEED_TOPIC_CONTENT.map((entry) => [entry.canonicalKey, entry]));

  const counters: Counters = {
    subjects: 0,
    topicsCreated: 0,
    topicsUpdated: 0,
    topicsArchived: 0,
    contentWritten: 0,
    contentSkipped: 0,
  };

  for (const subject of subjects) {
    const units = subject.units ?? [];
    if (!units.length) continue;

    counters.subjects += 1;

    /**
     * Flatten the units into one ordered list.
     *
     * `sequence` runs across the whole subject rather than restarting per unit,
     * because it is the order a student studies in and the number the UI shows
     * ("Topic 7 of 20"). The unit is still recorded, so the list can be grouped
     * back up for display.
     */
    const flattened: {
      title: string;
      unitNumber: number;
      unitTitle: string;
      sequence: number;
    }[] = [];

    for (const unit of units) {
      for (const title of unit.topics ?? []) {
        const trimmed = title.trim();
        if (!trimmed) continue;
        flattened.push({
          title: trimmed,
          unitNumber: unit.unitNumber,
          unitTitle: unit.title,
          sequence: flattened.length + 1,
        });
      }
    }

    if (!flattened.length) continue;

    /**
     * A title that appears in two units is a data error in the syllabus, and
     * the unique index on `(subjectId, slug)` would reject the second write
     * with a duplicate-key error that names neither the subject nor the title.
     * Catching it here reports something an administrator can act on.
     */
    const seenSlugs = new Set<string>();
    const deduped = flattened.filter((entry) => {
      const slug = topicSlug(entry.title);
      if (seenSlugs.has(slug)) {
        console.warn(
          `  ! ${subject.code}: "${entry.title}" appears twice in the syllabus — keeping the first.`
        );
        return false;
      }
      seenSlugs.add(slug);
      return true;
    });

    const existing = await Topic.find({ subjectId: subject._id }).select("slug _id status").lean();
    const existingBySlug = new Map(existing.map((row) => [row.slug, row]));

    for (const entry of deduped) {
      const slug = topicSlug(entry.title);
      const canonicalKey = canonicalTopicKey(entry.title);
      const difficulty = difficultyForUnit(entry.unitNumber, units.length);

      if (DRY_RUN) {
        if (existingBySlug.has(slug)) counters.topicsUpdated += 1;
        else counters.topicsCreated += 1;
        continue;
      }

      /**
       * Upsert on the natural key, so a re-run keeps the existing `_id`.
       *
       * That id is what progress rows and AI interactions point at. Recreating
       * topics on every run would silently reset every student's progress and
       * detach their question history from the topic it was about.
       */
      const result = await Topic.updateOne(
        { subjectId: subject._id, slug },
        {
          $set: {
            title: entry.title,
            unitNumber: entry.unitNumber,
            unitTitle: entry.unitTitle,
            sequence: entry.sequence,
            canonicalKey,
            difficulty,
            estimatedMinutes: estimateTopicMinutes({ subtopicCount: 0, difficulty }),
            source: "syllabus",
            // A previously-archived topic that has returned to the syllabus is
            // republished rather than left hidden.
            status: "published",
          },
          $setOnInsert: { subjectId: subject._id, slug },
        },
        { upsert: true }
      );

      if (result.upsertedCount) counters.topicsCreated += 1;
      else counters.topicsUpdated += 1;
    }

    /**
     * Titles that have left the syllabus are archived, never removed.
     *
     * A student who studied "Linked List" before it was renamed still has
     * progress and questions attached to that row (§58). Archiving hides it
     * from the topic list while leaving every reference resolvable.
     */
    const liveSlugs = new Set(deduped.map((entry) => topicSlug(entry.title)));
    const stale = existing.filter((row) => !liveSlugs.has(row.slug) && row.status !== "archived");

    if (stale.length && !DRY_RUN) {
      await Topic.updateMany(
        { _id: { $in: stale.map((row) => row._id) } },
        { $set: { status: "archived" } }
      );
    }
    counters.topicsArchived += stale.length;

    // ── Authored content ────────────────────────────────────────────────

    /**
     * A dry run has no rows to read back — nothing was written — so the count
     * is taken from the titles instead. Reporting zero would make the dry run
     * say the seed publishes no content at all, which is the one number
     * somebody runs it to check.
     */
    if (DRY_RUN) {
      counters.contentWritten += deduped.filter((entry) =>
        contentByKey.has(canonicalTopicKey(entry.title))
      ).length;
      continue;
    }

    const topics = await Topic.find({ subjectId: subject._id, status: "published" })
      .select("_id canonicalKey title")
      .lean();

    for (const topic of topics) {
      const authored = topic.canonicalKey ? contentByKey.get(topic.canonicalKey) : null;
      if (!authored) continue;

      /**
       * Existing content is left alone.
       *
       * The seed writes `published`, `authored` documents. A generated draft
       * awaiting review, or an editor's correction, is somebody's work — a
       * re-seed that overwrote it would destroy the review workflow it is
       * meant to demonstrate.
       */
      const already = await TopicContent.findOne({ topicId: topic._id, language: "english" })
        .select("_id")
        .lean();

      if (already) {
        counters.contentSkipped += 1;
        continue;
      }

      const now = new Date();
      await TopicContent.create({
        topicId: topic._id,
        subjectId: subject._id,
        language: "english",
        basicExplanation: authored.basicExplanation,
        whyItMatters: authored.whyItMatters,
        realWorldAnalogy: authored.realWorldAnalogy ?? null,
        terminology: authored.terminology ?? [],
        practicalExplanation: authored.practicalExplanation ?? null,
        realWorldExamples: authored.realWorldExamples ?? [],
        codeExample: authored.codeExample
          ? {
              language: authored.codeExample.language,
              code: authored.codeExample.code,
              explanation: authored.codeExample.explanation,
              output: authored.codeExample.output ?? null,
            }
          : null,
        keyPoints: authored.keyPoints,
        commonMistakes: authored.commonMistakes ?? [],
        prerequisites: authored.prerequisites ?? [],
        checkYourUnderstanding: (authored.checkYourUnderstanding ?? []).map((item) => ({
          question: item.question,
          answer: item.answer,
          hint: item.hint ?? null,
        })),
        advancedOverview: authored.advancedOverview ?? null,
        /**
         * `authored`, not `ai-generated`, and published outright.
         *
         * This text was written by hand for this seed. Marking it as generated
         * would make the topic page show the wrong provenance notice, which is
         * the one thing §36 asks the UI to get right.
         */
        origin: "authored",
        status: "published",
        contentVersion: 1,
        approvedAt: now,
        publishedAt: now,
      });

      await Topic.updateOne({ _id: topic._id }, { $set: { hasPublishedContent: true } });
      counters.contentWritten += 1;
    }
  }

  console.log("");
  console.log(DRY_RUN ? "Dry run — nothing was written." : "Done.");
  console.log(`  subjects processed : ${counters.subjects}`);
  console.log(`  topics created     : ${counters.topicsCreated}`);
  console.log(`  topics updated     : ${counters.topicsUpdated}`);
  console.log(`  topics archived    : ${counters.topicsArchived}`);
  console.log(`  content published  : ${counters.contentWritten}`);
  console.log(`  content left alone : ${counters.contentSkipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
