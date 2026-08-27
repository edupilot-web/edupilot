import { Badge, Card } from "@/components/admin/ui";
import type { SelectedContext, SubjectDetail } from "@/components/admin/ai/context-picker";

/**
 * The context summary (spec §5) and the subject information panel (spec §6).
 *
 * Server components with no interactivity: both are read-only renderings of data
 * that was already fetched, so neither ships JavaScript to hydrate. The
 * generation screen keeps them mounted while content is produced and edited,
 * which is what §5 means by the context remaining visible.
 *
 * Nothing here is editable. §6 is explicit that the administrator must not be
 * asked to re-enter what the academic module already holds — so this panel reads
 * the curriculum row and, where a field is empty, says it is not on record
 * rather than offering a blank input that implies it should be filled in here.
 */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/** Renders a value, or an explicit "not on record" (§6, §11 rule 11). */
function orMissing(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400 dark:text-slate-500">Not on record</span>;
  }
  return value;
}

export function ContextSummary({
  context,
  subject,
}: {
  context: SelectedContext;
  subject?: SubjectDetail | null;
}) {
  return (
    <Card title="Academic Context" description="Resolved from the academic master data, and re-verified on the server before anything is generated.">
      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="College" value={context.collegeName} />
        <Row label="Program" value={`${context.programName} (${context.degree})`} />
        <Row label="Branch" value={context.branchName} />
        <Row label="Regulation" value={context.regulationCode} />
        <Row label="Academic Year" value={context.academicYearLabel} />
        <Row label="Year / Semester" value={context.semesterLabel} />
        <Row label="Subject" value={context.subjectName} />
        <Row label="Credits" value={orMissing(subject?.credits)} />
        <Row label="Course Type" value={orMissing(subject?.courseType)} />
      </dl>
    </Card>
  );
}

export function SubjectInformation({ subject }: { subject: SubjectDetail }) {
  const ltp = [subject.lectureHours, subject.tutorialHours, subject.practicalHours];
  const hasLtp = ltp.some((value) => value !== null);

  return (
    <div className="space-y-3">
      <Card
        title="Subject Information"
        description="Loaded from the curriculum. Nothing here is re-entered by hand."
        actions={
          <div className="flex items-center gap-1.5">
            <Badge tone="neutral">{subject.code}</Badge>
            <Badge tone={subject.hasSyllabus ? "success" : "warning"}>
              {subject.hasSyllabus ? `${subject.units.length} units` : "No syllabus"}
            </Badge>
          </div>
        }
      >
        <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Subject" value={subject.name} />
          <Row label="Code" value={subject.code} />
          <Row label="Credits" value={orMissing(subject.credits)} />
          <Row label="Course Type" value={orMissing(subject.courseType)} />
          <Row
            label="L – T – P"
            value={hasLtp ? ltp.map((value) => value ?? 0).join(" – ") : orMissing(null)}
          />
          <Row label="Year" value={subject.year} />
          <Row label="Semester" value={subject.semester} />
          <Row label="Regulation" value={orMissing(subject.regulationCode)} />
        </dl>

        {(subject.prerequisites.length > 0 || subject.learningObjectives.length > 0 || subject.outcomes.length > 0) && (
          <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-800">
            <Listing label="Prerequisites" items={subject.prerequisites} />
            <Listing label="Learning Objectives" items={subject.learningObjectives} />
            {subject.outcomes.length > 0 && <Listing label="Course Outcomes" items={subject.outcomes} />}
          </div>
        )}
      </Card>

      {/*
        The syllabus, shown in full.

        This is the block the generator is grounded on (§9), so an operator must
        be able to see exactly what the model will be given — a summary here
        would hide the difference between a rich syllabus and a bare unit list.
      */}
      <Card
        title="Syllabus"
        description={
          subject.hasSyllabus
            ? "These units are handed to the generator as the outline it must follow."
            : "Nothing on record. Content cannot be grounded on a curriculum that is not here."
        }
      >
        {subject.units.length > 0 ? (
          <ol className="space-y-3">
            {subject.units.map((unit) => (
              <li key={unit.unitNumber} className="rounded-lg border border-slate-200/80 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                    Unit {unit.unitNumber}: {unit.title}
                  </p>
                  {unit.hours != null && (
                    <span className="text-[11.5px] text-slate-400 dark:text-slate-500">{unit.hours} hours</span>
                  )}
                </div>
                {unit.description && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                    {unit.description}
                  </p>
                )}
                {unit.topics.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {unit.topics.map((topic) => (
                      <li
                        key={topic}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11.5px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {topic}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ) : subject.syllabusText ? (
          <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
            {subject.syllabusText}
          </p>
        ) : (
          <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
            No syllabus or units are recorded for this subject.
          </p>
        )}
      </Card>

      {(subject.referenceBooks.length > 0 || subject.referenceMaterials.length > 0) && (
        <Card
          title="Reference Materials"
          description="The only references the generator may cite. Anything outside this list is flagged as a possible fabrication."
        >
          <ul className="space-y-2">
            {subject.referenceBooks.map((book, index) => (
              <li key={`${book.title}-${index}`} className="text-[12.5px] text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-800 dark:text-slate-100">{book.title}</span>
                {book.authors && <span className="text-slate-500 dark:text-slate-400"> — {book.authors}</span>}
                {book.publisher && <span className="text-slate-400 dark:text-slate-500">, {book.publisher}</span>}
                {book.edition && <span className="text-slate-400 dark:text-slate-500"> ({book.edition} ed.)</span>}
                {book.kind === "reference" && (
                  <span className="ml-1.5 text-[11px] text-slate-400">further reading</span>
                )}
              </li>
            ))}
            {subject.referenceMaterials.map((material) => (
              <li key={material} className="text-[12.5px] text-slate-600 dark:text-slate-400">
                {material}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Listing({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
        {label}
      </p>
      {items.length ? (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => (
            <li key={item} className="flex gap-1.5 text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-300">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12.5px] text-slate-400 dark:text-slate-500">Not on record</p>
      )}
    </div>
  );
}
