import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import {
  positionLabel,
  resolveAcademicPosition,
  semesterLabel,
  yearOfSemester,
  type AcademicPosition,
} from "@/lib/curriculum/position";
import { Program } from "@/models/AcademicStructure";
import { CurriculumSubject, Regulation } from "@/models/Curriculum";
import { StudentProfile } from "@/models/StudentProfile";
import { StudentSemesterSubjects } from "@/models/StudentSemester";
import { SubjectTextbook, Textbook, TextbookTopic } from "@/models/Textbook";

/**
 * The student-facing read of the curriculum.
 *
 * Every function here takes a `userId` and resolves the academic coordinate
 * from the *profile*, never from anything the browser supplied. The subject
 * detail read then re-checks that the subject it was asked for actually belongs
 * to that coordinate — the same principle `onboarding/academic-context.ts` and
 * the AI module's context builder apply, for the same reason: an id in a URL is
 * a claim, not a fact.
 */

// ── Overview ──────────────────────────────────────────────────────────────

export type SubjectCard = {
  id: string;
  name: string;
  code: string;
  credits: number | null;
  courseType: string;
  unitCount: number;
  /** Topic titles the syllabus lists, across all units. */
  syllabusTopicCount: number;
  /** Books mapped to this subject, and whether any reading is attached. */
  bookCount: number;
  primaryBookTitle: string | null;
  /** Textbook topics reachable through the mapping, for "3h of reading". */
  readingTopicCount: number;
  readingMinutes: number;
};

/**
 * Why the screen has nothing to show, when it has nothing to show.
 *
 * A discriminated union rather than an empty list plus a boolean, because each
 * of these wants different words and a different way out, and collapsing them
 * into "no data" is what makes a student think the product is broken rather
 * than incomplete.
 */
export type CurriculumState =
  | { kind: "ready"; subjects: SubjectCard[] }
  /** No profile at all — should be unreachable behind the onboarding gate. */
  | { kind: "no-profile" }
  /** Graduated: there is no current semester to show. */
  | { kind: "graduated" }
  /** The college has no regulation configured, so there is no curriculum. */
  | { kind: "no-regulation"; collegeName: string }
  /** A regulation exists but this branch has no subjects under it. */
  | { kind: "no-subjects-for-branch"; branchName: string | null; regulationCode: string | null }
  /** We know the year but not which half of it, so we cannot pick a subject list. */
  | { kind: "no-semester"; year: number | null }
  /** The regulation is configured but this semester is empty. */
  | { kind: "empty-semester"; semester: number };

export type CurriculumOverview = {
  position: AcademicPosition;
  positionLabel: string;
  semesterLabel: string | null;
  collegeName: string;
  branchName: string | null;
  programName: string | null;
  regulationCode: string | null;
  totalSemesters: number | null;
  /** Whether the semester list was confirmed by the student or derived for them. */
  subjectsConfirmed: boolean;
  state: CurriculumState;
};

export async function getCurriculumOverview(userId: string): Promise<CurriculumOverview> {
  await connectDB();

  const profile = await StudentProfile.findOne({ userId }).lean();

  if (!profile) {
    return {
      position: resolveAcademicPosition({}),
      positionLabel: "Year not set",
      semesterLabel: null,
      collegeName: "",
      branchName: null,
      programName: null,
      regulationCode: null,
      totalSemesters: null,
      subjectsConfirmed: false,
      state: { kind: "no-profile" },
    };
  }

  const regulation = profile.regulationId
    ? await Regulation.findById(profile.regulationId).select("code totalSemesters").lean()
    : null;

  // The programme's duration is the fallback cap when no regulation states one.
  const program = profile.programId
    ? await Program.findById(profile.programId).select("durationYears").lean()
    : null;

  const position = resolveAcademicPosition({
    studyStatus: profile.studyStatus,
    admissionYear: profile.admissionYear,
    admissionType: profile.admissionType,
    currentYear: profile.currentYear,
    currentSemester: profile.currentSemester,
    totalSemesters: regulation?.totalSemesters ?? null,
    durationYears: program?.durationYears ?? null,
  });

  const base = {
    position,
    positionLabel: positionLabel(position),
    semesterLabel: semesterLabel(position, regulation?.totalSemesters ?? null),
    collegeName: profile.collegeName,
    // `.lean()` skips schema defaults, so a row written before these fields
    // existed comes back without them rather than as null.
    branchName: profile.branchName ?? null,
    programName: profile.programName ?? null,
    regulationCode: regulation?.code ?? profile.regulationCode ?? null,
    totalSemesters: regulation?.totalSemesters ?? null,
    subjectsConfirmed: false,
  };

  if (position.source === "graduated") {
    return { ...base, state: { kind: "graduated" } };
  }
  if (!profile.collegeId || !profile.programId || !profile.branchId || !profile.regulationId) {
    return { ...base, state: { kind: "no-regulation", collegeName: profile.collegeName } };
  }
  if (position.semester === null) {
    return { ...base, state: { kind: "no-semester", year: position.year } };
  }

  // The semester row is the record of truth when one exists; the profile's flat
  // `subjectIds` is the cache behind it, and the prescribed list is the
  // fallback for a student who has neither.
  const semesterRow = await StudentSemesterSubjects.findOne({
    studentProfileId: profile._id,
    semester: position.semester,
  })
    .select("subjectIds confirmedAt")
    .lean();

  const chosenIds = semesterRow?.subjectIds?.length
    ? semesterRow.subjectIds
    : profile.subjectIds ?? [];

  const coordinate = {
    collegeId: profile.collegeId,
    programId: profile.programId,
    branchId: profile.branchId,
    regulationId: profile.regulationId,
    // `as const` so the literal does not widen to `string`, which the model's
    // typed filter rejects.
    status: "active" as const,
  };

  const prescribed = await CurriculumSubject.find({
    ...coordinate,
    semester: position.semester,
  })
    .select("_id name code credits courseType units")
    .sort({ courseType: 1, code: 1 })
    .lean();

  if (!prescribed.length) {
    // Does the branch have *any* subjects on this regulation? Distinguishes "we
    // have no curriculum for you" from "this particular semester is empty",
    // which are different problems with different answers.
    const anyForBranch = await CurriculumSubject.countDocuments(coordinate);
    return {
      ...base,
      state: anyForBranch
        ? { kind: "empty-semester", semester: position.semester }
        : {
            kind: "no-subjects-for-branch",
            branchName: profile.branchName ?? null,
            regulationCode: base.regulationCode,
          },
    };
  }

  // A student's own choice wins over the prescribed list where they overlap;
  // where it does not, the prescribed list is what the regulation says they are
  // taking, and hiding it because nobody pressed a button would be worse.
  const chosen = new Set(chosenIds.map(String));
  const subjects = chosen.size
    ? prescribed.filter((subject) => chosen.has(String(subject._id)))
    : prescribed;

  const cards = await decorateWithBooks(subjects.length ? subjects : prescribed);

  return {
    ...base,
    subjectsConfirmed: Boolean(semesterRow?.confirmedAt),
    state: { kind: "ready", subjects: cards },
  };
}

type LeanSubject = {
  _id: Types.ObjectId;
  name: string;
  code: string;
  credits?: number | null;
  courseType?: string | null;
  units?: { unitNumber: number; topics?: string[] }[];
};

/**
 * Attaches the reading summary to each subject card.
 *
 * One query for every mapping and one for the topic totals, rather than a pair
 * per subject: a semester is five to eight subjects, and doing this per card is
 * the classic way a list view becomes twenty round trips.
 */
async function decorateWithBooks(subjects: LeanSubject[]): Promise<SubjectCard[]> {
  const subjectIds = subjects.map((subject) => subject._id);

  const mappings = await SubjectTextbook.find({ subjectId: { $in: subjectIds } })
    .select("subjectId textbookTitle isPrimary unitMappings")
    .sort({ isPrimary: -1 })
    .lean();

  // Every textbook topic these mappings reach, summed per subject.
  const topicIds = [
    ...new Set(
      mappings.flatMap((mapping) =>
        mapping.unitMappings.flatMap((unit) => unit.topicIds.map(String))
      )
    ),
  ];

  const topics = topicIds.length
    ? await TextbookTopic.find({ _id: { $in: topicIds } })
        .select("_id estimatedMinutes")
        .lean()
    : [];

  const minutesById = new Map(
    topics.map((topic) => [String(topic._id), topic.estimatedMinutes ?? 0])
  );

  const bySubject = new Map<string, typeof mappings>();
  for (const mapping of mappings) {
    const key = String(mapping.subjectId);
    const list = bySubject.get(key);
    if (list) list.push(mapping);
    else bySubject.set(key, [mapping]);
  }

  return subjects.map((subject) => {
    const own = bySubject.get(String(subject._id)) ?? [];
    const reachable = new Set(
      own.flatMap((mapping) => mapping.unitMappings.flatMap((unit) => unit.topicIds.map(String)))
    );

    let minutes = 0;
    for (const id of reachable) minutes += minutesById.get(id) ?? 0;

    const primary = own.find((mapping) => mapping.isPrimary) ?? own[0] ?? null;

    return {
      id: String(subject._id),
      name: subject.name,
      code: subject.code,
      credits: subject.credits ?? null,
      courseType: subject.courseType ?? "Core",
      unitCount: subject.units?.length ?? 0,
      syllabusTopicCount: (subject.units ?? []).reduce(
        (total, unit) => total + (unit.topics?.length ?? 0),
        0
      ),
      bookCount: own.length,
      primaryBookTitle: primary?.textbookTitle ?? null,
      readingTopicCount: reachable.size,
      readingMinutes: minutes,
    };
  });
}

// ── Subject detail ────────────────────────────────────────────────────────

export type ReadingTopic = {
  id: string;
  label: string;
  title: string;
  difficulty: string;
  estimatedMinutes: number | null;
  pageStart: number | null;
  pageEnd: number | null;
};

export type UnitReading = {
  bookId: string;
  bookTitle: string;
  role: string;
  isPrimary: boolean;
  chapters: { chapterNumber: number; title: string }[];
  topics: ReadingTopic[];
  note: string | null;
};

export type SubjectUnit = {
  unitNumber: number;
  title: string;
  description: string | null;
  hours: number | null;
  /** The syllabus's own topic titles — the authoritative outline. */
  syllabusTopics: string[];
  /** The mapped reading, one entry per book that covers this unit. */
  reading: UnitReading[];
};

export type SubjectBook = {
  id: string;
  title: string;
  authors: string[];
  publisher: string | null;
  edition: string | null;
  year: number | null;
  role: string;
  isPrimary: boolean;
  coveragePercent: number | null;
  /** Units of this subject the book covers, for "covers 4 of 5 units". */
  unitsCovered: number;
};

export type SubjectView = {
  id: string;
  name: string;
  code: string;
  credits: number | null;
  courseType: string;
  year: number;
  semester: number;
  lectureHours: number | null;
  tutorialHours: number | null;
  practicalHours: number | null;
  prerequisites: string[];
  learningObjectives: string[];
  outcomes: string[];
  syllabusText: string | null;
  units: SubjectUnit[];
  books: SubjectBook[];
  /** Bibliography entries with no catalogue row behind them. */
  furtherReading: { title: string; authors: string | null; kind: string }[];
};

/**
 * One subject, with its syllabus and the reading mapped onto each unit.
 *
 * Returns null when the subject does not exist *or* does not belong to this
 * student's coordinate — deliberately the same answer for both, so a probed id
 * cannot be used to learn which subjects another college runs.
 */
export async function getSubjectView(
  userId: string,
  subjectId: string
): Promise<SubjectView | null> {
  if (!Types.ObjectId.isValid(subjectId)) return null;

  await connectDB();

  const profile = await StudentProfile.findOne({ userId })
    .select("collegeId programId branchId regulationId")
    .lean();

  if (!profile?.collegeId || !profile.programId || !profile.branchId || !profile.regulationId) {
    return null;
  }

  // The coordinate is part of the query, not checked afterwards: a subject from
  // another college is simply not found.
  const subject = await CurriculumSubject.findOne({
    _id: subjectId,
    collegeId: profile.collegeId,
    programId: profile.programId,
    branchId: profile.branchId,
    regulationId: profile.regulationId,
    status: "active",
  }).lean();

  if (!subject) return null;

  const mappings = await SubjectTextbook.find({ subjectId: subject._id })
    .sort({ isPrimary: -1, role: 1 })
    .lean();

  const bookIds = mappings.map((mapping) => mapping.textbookId);
  const books = bookIds.length
    ? await Textbook.find({ _id: { $in: bookIds } })
        .select("title authors publisher edition year chapters")
        .lean()
    : [];
  const bookById = new Map(books.map((book) => [String(book._id), book]));

  const allTopicIds = [
    ...new Set(
      mappings.flatMap((mapping) =>
        mapping.unitMappings.flatMap((unit) => unit.topicIds.map(String))
      )
    ),
  ];
  const topics = allTopicIds.length
    ? await TextbookTopic.find({ _id: { $in: allTopicIds } })
        .select("_id chapterNumber topicNumber title difficulty estimatedMinutes pageStart pageEnd")
        .sort({ chapterNumber: 1, topicNumber: 1 })
        .lean()
    : [];
  const topicById = new Map(topics.map((topic) => [String(topic._id), topic]));

  const units: SubjectUnit[] = (subject.units ?? []).map((unit) => {
    const reading: UnitReading[] = [];

    for (const mapping of mappings) {
      const forUnit = mapping.unitMappings.find(
        (entry) => entry.unitNumber === unit.unitNumber
      );
      if (!forUnit) continue;

      const book = bookById.get(String(mapping.textbookId));
      if (!book) continue;

      reading.push({
        bookId: String(book._id),
        bookTitle: book.title,
        role: mapping.role,
        isPrimary: mapping.isPrimary,
        chapters: forUnit.chapterNumbers
          .map((number) => book.chapters.find((chapter) => chapter.chapterNumber === number))
          .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter))
          .map((chapter) => ({ chapterNumber: chapter.chapterNumber, title: chapter.title })),
        topics: forUnit.topicIds
          .map((id) => topicById.get(String(id)))
          .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
          .map((topic) => ({
            id: String(topic._id),
            label: `${topic.chapterNumber}.${topic.topicNumber}`,
            title: topic.title,
            difficulty: topic.difficulty ?? "basic",
            estimatedMinutes: topic.estimatedMinutes ?? null,
            pageStart: topic.pageStart ?? null,
            pageEnd: topic.pageEnd ?? null,
          })),
        note: forUnit.note ?? null,
      });
    }

    return {
      unitNumber: unit.unitNumber,
      title: unit.title,
      description: unit.description ?? null,
      hours: unit.hours ?? null,
      syllabusTopics: unit.topics ?? [],
      reading,
    };
  });

  const unitNumbers = new Set(units.map((unit) => unit.unitNumber));

  const catalogued = new Set(bookIds.map(String));

  return {
    id: String(subject._id),
    name: subject.name,
    code: subject.code,
    credits: subject.credits ?? null,
    courseType: subject.courseType ?? "Core",
    year: subject.year ?? yearOfSemester(subject.semester),
    semester: subject.semester,
    lectureHours: subject.lectureHours ?? null,
    tutorialHours: subject.tutorialHours ?? null,
    practicalHours: subject.practicalHours ?? null,
    prerequisites: subject.prerequisites ?? [],
    learningObjectives: subject.learningObjectives ?? [],
    outcomes: subject.outcomes ?? [],
    syllabusText: subject.syllabusText ?? null,
    units,
    books: mappings
      .map((mapping): SubjectBook | null => {
        const book = bookById.get(String(mapping.textbookId));
        if (!book) return null;
        return {
          id: String(book._id),
          title: book.title,
          authors: book.authors ?? [],
          publisher: book.publisher ?? null,
          edition: book.edition ?? null,
          year: book.year ?? null,
          role: mapping.role,
          isPrimary: mapping.isPrimary,
          coveragePercent: mapping.coveragePercent ?? null,
          unitsCovered: mapping.unitMappings.filter((entry) =>
            unitNumbers.has(entry.unitNumber)
          ).length,
        };
      })
      .filter((book): book is SubjectBook => book !== null),
    // The syllabus's own bibliography, minus anything already shown above as a
    // catalogued book — listing a book twice under two headings reads as a bug.
    furtherReading: (subject.referenceBooks ?? [])
      .filter((entry) => !entry.textbookId || !catalogued.has(String(entry.textbookId)))
      .map((entry) => ({
        title: entry.title,
        authors: entry.authors ?? null,
        kind: entry.kind ?? "reference",
      })),
  };
}
