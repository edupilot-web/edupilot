/**
 * Seeds the textbook catalogue, its topics, and the subject-to-book mappings.
 *
 * Non-destructive and idempotent, like the curriculum seeder it runs after: it
 * upserts its own three collections by their natural keys, so re-running
 * converges rather than duplicating, and it never writes to colleges,
 * departments, programmes, regulations or subjects.
 *
 * It seeds *onto* whatever `seed:curriculum` produced. A mapping is only written
 * where the subject actually exists, and a subject that has no mapping is left
 * alone — it still has its own syllabus units to show, which is the correct
 * fallback and better than a book that covers nothing.
 *
 * Run with:  npm run seed:textbooks
 *            npm run seed:textbooks -- --fix-profiles
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { CurriculumSubject, Regulation } from "../src/models/Curriculum";
import { StudentProfile } from "../src/models/StudentProfile";
import { StudentSemesterSubjects } from "../src/models/StudentSemester";
import { SubjectTextbook, Textbook, TextbookTopic } from "../src/models/Textbook";
import {
  resolveAcademicPosition,
  yearOfSemester,
} from "../src/lib/curriculum/position";
import { SUBJECT_MAPPINGS, TEXTBOOKS, type SeedTextbook } from "./seed-data/textbooks";

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

/**
 * Upserts one book and its topics.
 *
 * Chapters go in with the book, since they are embedded. Topics are upserted one
 * by one on `(textbookId, chapterNumber, topicNumber)` so a re-run updates
 * titles in place instead of inserting a second copy — the unique index would
 * reject that anyway, and failing a seed on its second run is not idempotent.
 */
async function upsertTextbook(seed: SeedTextbook): Promise<{
  id: mongoose.Types.ObjectId;
  topicIds: Map<string, mongoose.Types.ObjectId>;
  topicCount: number;
}> {
  const chapters = seed.chapters.map((chapter) => ({
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    pageStart: chapter.pageStart ?? null,
    pageEnd: chapter.pageEnd ?? null,
    topicCount: chapter.topics.length,
  }));

  const topicCount = seed.chapters.reduce((total, chapter) => total + chapter.topics.length, 0);

  // Matched on ISBN when there is one, on title plus edition otherwise — the
  // same two identities the model's indexes declare.
  const filter = seed.isbn13
    ? { isbn13: seed.isbn13 }
    : { title: seed.title, edition: seed.edition ?? null };

  const book = await Textbook.findOneAndUpdate(
    filter,
    {
      $set: {
        title: seed.title,
        subtitle: seed.subtitle ?? null,
        authors: seed.authors,
        publisher: seed.publisher,
        edition: seed.edition ?? null,
        year: seed.year ?? null,
        isbn13: seed.isbn13 ?? null,
        totalPages: seed.totalPages ?? null,
        chapters,
        chapterCount: chapters.length,
        topicCount,
        status: "active",
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  const topicIds = new Map<string, mongoose.Types.ObjectId>();

  for (const chapter of seed.chapters) {
    for (const [index, topic] of chapter.topics.entries()) {
      const topicNumber = index + 1;
      const row = await TextbookTopic.findOneAndUpdate(
        { textbookId: book._id, chapterNumber: chapter.chapterNumber, topicNumber },
        {
          $set: {
            title: topic.title,
            estimatedMinutes: topic.minutes ?? null,
            difficulty: topic.difficulty ?? "basic",
            keywords: topic.keywords ?? [],
            status: "active",
          },
        },
        { upsert: true, returnDocument: "after" }
      );
      topicIds.set(`${chapter.chapterNumber}.${topicNumber}`, row._id);
    }
  }

  return { id: book._id, topicIds, topicCount };
}

/**
 * Points a subject's existing bibliography entry at the catalogue row.
 *
 * Matched on the titles the seed data declares in `matchTitles`, so a book the
 * curriculum spells slightly differently still finds its row. Only the pointer
 * is written — the title, author and ISBN the curriculum stated are left exactly
 * as they are, because they are what the syllabus document says.
 */
async function linkReferenceBooks(
  titleToBookId: Map<string, mongoose.Types.ObjectId>
): Promise<number> {
  const subjects = await CurriculumSubject.find({ "referenceBooks.0": { $exists: true } }).select(
    "referenceBooks"
  );

  let linked = 0;

  for (const subject of subjects) {
    let changed = false;

    for (const entry of subject.referenceBooks) {
      const bookId = titleToBookId.get(entry.title.trim().toLowerCase());
      if (!bookId) continue;
      if (entry.textbookId && String(entry.textbookId) === String(bookId)) continue;
      entry.textbookId = bookId;
      changed = true;
      linked += 1;
    }

    if (changed) await subject.save();
  }

  return linked;
}

async function main(): Promise<void> {
  await connectDB();
  console.log("connected to", mongoose.connection.name, "\n");

  // ── 1. The catalogue ────────────────────────────────────────────────────
  const books = new Map<string, { id: mongoose.Types.ObjectId; topicIds: Map<string, mongoose.Types.ObjectId> }>();
  const titleToBookId = new Map<string, mongoose.Types.ObjectId>();
  let topicTotal = 0;

  for (const seed of TEXTBOOKS) {
    const { id, topicIds, topicCount } = await upsertTextbook(seed);
    books.set(seed.key, { id, topicIds });
    topicTotal += topicCount;
    for (const title of seed.matchTitles) {
      titleToBookId.set(title.trim().toLowerCase(), id);
    }
    console.log(`  book  ${seed.title} — ${seed.chapters.length} chapters, ${topicCount} topics`);
  }

  console.log(`\ntextbooks: ${TEXTBOOKS.length}, topics: ${topicTotal}\n`);

  // ── 2. The mappings ─────────────────────────────────────────────────────
  let mappingCount = 0;
  let missingSubjects = 0;
  const unmappedCodes = new Set<string>();

  for (const mapping of SUBJECT_MAPPINGS) {
    const book = books.get(mapping.textbookKey);
    if (!book) throw new Error(`Mapping names an unknown textbook key: ${mapping.textbookKey}`);

    // One mapping row per *subject row*, not per subject code: the same MA101
    // exists once per college, branch and regulation, and each of those is a
    // different document that needs its own mapping.
    const subjects = await CurriculumSubject.find({ code: mapping.subjectCode })
      .select("_id code units")
      .lean();

    if (!subjects.length) {
      unmappedCodes.add(mapping.subjectCode);
      missingSubjects += 1;
      continue;
    }

    const seed = TEXTBOOKS.find((entry) => entry.key === mapping.textbookKey)!;

    for (const subject of subjects) {
      // Drop any unit the subject does not actually have. A mapping that points
      // at unit 5 of a four-unit syllabus would render an empty section, and
      // silently is the worst way for that to happen.
      const unitNumbers = new Set((subject.units ?? []).map((unit) => unit.unitNumber));
      const unitMappings = mapping.units
        .filter((unit) => unitNumbers.size === 0 || unitNumbers.has(unit.unitNumber))
        .map((unit) => ({
          unitNumber: unit.unitNumber,
          chapterNumbers: unit.chapterNumbers,
          // Resolve the chapters to their topic ids, so the read path does not
          // have to re-derive the join on every request.
          topicIds: unit.chapterNumbers.flatMap((chapterNumber) => {
            const chapter = seed.chapters.find((entry) => entry.chapterNumber === chapterNumber);
            if (!chapter) return [];
            return chapter.topics
              .map((_, index) => book.topicIds.get(`${chapterNumber}.${index + 1}`))
              .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
          }),
          note: unit.note ?? null,
        }));

      await SubjectTextbook.findOneAndUpdate(
        { subjectId: subject._id, textbookId: book.id },
        {
          $set: {
            textbookTitle: seed.title,
            role: mapping.role,
            isPrimary: mapping.isPrimary,
            unitMappings,
            coveragePercent: mapping.coveragePercent ?? null,
          },
        },
        { upsert: true }
      );
      mappingCount += 1;
    }
  }

  console.log(`subject-textbook mappings: ${mappingCount}`);
  if (unmappedCodes.size) {
    console.log(
      `  ${missingSubjects} mapping(s) skipped — no such subject seeded: ${[...unmappedCodes].join(", ")}`
    );
  }

  const linked = await linkReferenceBooks(titleToBookId);
  console.log(`bibliography entries pointed at the catalogue: ${linked}\n`);

  // ── 3. Student semesters ────────────────────────────────────────────────
  if (hasFlag("fix-profiles")) {
    await fixProfiles();
  } else {
    const profiles = await StudentProfile.countDocuments({ profileCompleted: true });
    console.log(
      `${profiles} completed profile(s) left untouched. Pass --fix-profiles to attach regulations and semester subject lists.`
    );
  }

  await mongoose.disconnect();
}

/**
 * Fills in the academic coordinate a real profile is missing, and records the
 * semester's subjects.
 *
 * Opt-in behind a flag because it writes to live student rows. It deliberately
 * does **not** invent an admission year: that is the one field the derivation
 * depends on, and guessing it would make every position downstream confidently
 * wrong. A profile without one is reported and skipped.
 */
async function fixProfiles(): Promise<void> {
  const profiles = await StudentProfile.find({ profileCompleted: true });
  console.log(`repairing ${profiles.length} profile(s):`);

  for (const profile of profiles) {
    const label = profile.collegeName ?? String(profile._id);

    if (!profile.collegeId || !profile.programId || !profile.branchId) {
      console.log(`  ${label}: no college/programme/branch ids, skipped`);
      continue;
    }

    // Attach the regulation that covers this student's admission year, newest
    // first — a college running R20 and R23 applies whichever was in force.
    if (!profile.regulationId) {
      const regulation = await Regulation.findOne({
        collegeId: profile.collegeId,
        status: "active",
        ...(profile.admissionYear
          ? { effectiveFromYear: { $lte: profile.admissionYear } }
          : {}),
      })
        .sort({ effectiveFromYear: -1 })
        .select("_id code totalSemesters")
        .lean();

      if (!regulation) {
        console.log(`  ${label}: no regulation for this college, skipped`);
        continue;
      }
      profile.regulationId = regulation._id;
      profile.regulationCode = regulation.code;
    }

    const regulation = await Regulation.findById(profile.regulationId)
      .select("code totalSemesters")
      .lean();

    const position = resolveAcademicPosition({
      studyStatus: profile.studyStatus,
      admissionYear: profile.admissionYear,
      admissionType: profile.admissionType,
      currentYear: profile.currentYear,
      currentSemester: profile.currentSemester,
      totalSemesters: regulation?.totalSemesters ?? null,
    });

    if (position.semester === null) {
      console.log(
        `  ${label}: cannot resolve a semester (${position.source}); left as year ${profile.currentYear ?? "?"}`
      );
      await profile.save();
      continue;
    }

    const subjects = await CurriculumSubject.find({
      collegeId: profile.collegeId,
      programId: profile.programId,
      branchId: profile.branchId,
      regulationId: profile.regulationId,
      semester: position.semester,
      status: "active",
    })
      .select("_id name code courseType")
      .lean();

    // Electives are a choice, not an assignment, so they are not written into
    // the semester list on the student's behalf.
    const core = subjects.filter((subject) => !String(subject.courseType).includes("Elective"));

    // Read before the write below overwrites it, so the conflict note reports
    // the year the student actually typed rather than the one just derived.
    const storedYear = profile.currentYear;

    profile.currentSemester = position.semester;
    profile.currentYear = yearOfSemester(position.semester);
    profile.subjectIds = core.map((subject) => subject._id);
    await profile.save();

    await StudentSemesterSubjects.findOneAndUpdate(
      { studentProfileId: profile._id, semester: position.semester },
      {
        $set: {
          userId: profile.userId,
          year: yearOfSemester(position.semester),
          regulationId: profile.regulationId,
          subjectIds: core.map((subject) => subject._id),
          source: "prescribed",
        },
      },
      { upsert: true }
    );

    const electives = subjects.length - core.length;
    console.log(
      `  ${label}: ${profile.regulationCode} sem ${position.semester} (${position.source}) — ${core.length} core subject(s)` +
        (electives ? `, ${electives} elective(s) left to choose` : "")
    );
    if (position.storedYearConflicts) {
      console.log(
        `      note: the stored year (${storedYear ?? "unset"}) disagreed with the ${profile.admissionYear} admission year`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
