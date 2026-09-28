import Link from "next/link";
import type { ResolvedStudentContext } from "@/lib/onboarding/academic-context";

/**
 * The student's own profile (§33's other half).
 *
 * Read-only on purpose. Every academic field here is a link in a chain the
 * server validates as a whole — a college implies a programme implies a
 * regulation implies a subject list — so editing one in place would need the
 * cascade the onboarding flow already implements. "Update academic details"
 * hands the student to that flow rather than to a second copy of it.
 *
 * What is *not* here matters as much: there is no field for the current
 * semester as a stored number. The semester is derived from the admission year
 * on every read, which is what makes it self-maintaining, and offering to edit
 * it directly would invite a student to set a value that next term's derivation
 * silently disagrees with.
 */

export type ProfileAccount = {
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  city: string | null;
  isGoogleAccount: boolean;
};

export type ProfileCurriculum = {
  subjects: { id: string; name: string; code: string; credits: number | null }[];
  /**
   * Whether the student picked these or they are the semester's default.
   *
   * Worth saying on screen. A student who has never chosen electives and one who
   * chose exactly these are looking at the same list, and only the first has
   * something left to do.
   */
  confirmed: boolean;
};

export function ProfileScreen({
  account,
  academic,
  curriculum,
  position,
  stale,
  justUpdated,
}: {
  account: ProfileAccount;
  /** Null before onboarding has written anything. */
  academic: ResolvedStudentContext | null;
  /**
   * The semester's subjects, from the same source `/curriculum` and the
   * dashboard read. Not from the stored selection: the two differ whenever a
   * semester change has cleared the old list, and a profile saying "no
   * subjects" beside a dashboard listing two is nonsense to read.
   */
  curriculum: ProfileCurriculum | null;
  /**
   * Where the student is, from the same resolver `/curriculum` and the dashboard
   * use.
   *
   * Not from the stored `currentYear`/`currentSemester`, which are only set when
   * the student typed them: reading those showed "Year: Not set" on this page
   * beside a dashboard announcing "Semester 5 of 8". Both were describing the
   * same student. `derived` is what makes the difference sayable rather than
   * something the reader has to infer from a blank.
   */
  position: { year: number | null; semester: number | null; derived: boolean } | null;
  /**
   * Set when the stored coordinate no longer resolves — an archived regulation,
   * a programme that was restructured. The profile still exists; it just cannot
   * be displayed truthfully, and saying so beats rendering a blank.
   */
  stale: string | null;
  justUpdated: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
            My profile
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            Your subjects, assignments and notes all follow from what is here.
          </p>
        </div>
        <Link
          href="/onboarding/academic?edit=1"
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700"
        >
          Update academic details
        </Link>
      </header>

      {justUpdated && (
        <Banner tone="ok">Your academic details have been updated.</Banner>
      )}

      {stale && <Banner tone="warn">{stale}</Banner>}

      <Card title="Account">
        <Field label="Name" value={account.name} />
        <Field
          label="Email"
          value={account.email}
          note={account.emailVerified ? "Verified" : "Not verified yet"}
          noteTone={account.emailVerified ? "ok" : "warn"}
        />
        <Field label="Phone" value={account.phone} />
        <Field label="City" value={account.city} />
        <Field
          label="Sign-in"
          value={account.isGoogleAccount ? "Google" : "Email and password"}
        />
      </Card>

      {academic ? (
        <>
          <Card title="Institution">
            <Field label="State" value={academic.state?.name ?? null} />
            <Field label="College" value={academic.college?.name ?? null} />
            <Field
              label="University"
              value={academic.university?.shortName || academic.university?.name || null}
            />
            <Field label="Type" value={institutionLabel(academic.college)} />
          </Card>

          <Card title="Course">
            <Field label="Programme" value={academic.program?.name ?? null} />
            <Field label="Branch" value={academic.branch?.name ?? null} />
            <Field
              label="Regulation"
              value={regulationLabel(academic.regulation)}
              note={academic.hasCurriculum ? undefined : "Not configured for your college yet"}
            />
          </Card>

          <Card title="Where you are">
            <Field
              label="Admission batch"
              value={
                academic.admissionYear
                  ? academic.admissionType === "regular"
                    ? String(academic.admissionYear)
                    : `${academic.admissionYear} · ${academic.admissionType.replace("-", " ")}`
                  : null
              }
            />
            <Field
              label="Year"
              value={position?.year ? `Year ${position.year}` : null}
              note={position?.derived ? "Worked out from your admission batch" : undefined}
            />
            {academic.hasCurriculum && (
              <Field
                label="Semester"
                value={position?.semester ? `Semester ${position.semester}` : null}
              />
            )}
            <Field
              label="Expected graduation"
              value={academic.expectedGraduationYear ? String(academic.expectedGraduationYear) : null}
            />
          </Card>

          {academic.hasCurriculum && (
            <Card
              title={`Subjects${curriculum?.subjects.length ? ` (${curriculum.subjects.length})` : ""}`}
            >
              {curriculum?.subjects.length ? (
                <>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {curriculum.subjects.map((subject) => (
                      <li key={subject.id} className="flex items-baseline justify-between gap-3 py-2.5">
                        <span className="text-[14px] text-slate-900 dark:text-white">{subject.name}</span>
                        <span className="shrink-0 text-[12.5px] text-slate-400 dark:text-slate-500">
                          {[subject.code, subject.credits ? `${subject.credits} cr` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {!curriculum.confirmed && (
                    <p className="mt-3.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                      This is your semester&apos;s curriculum. You have not picked your own subjects
                      yet, so electives may not be right.{" "}
                      <Link href="/onboarding/academic?edit=1" className="font-semibold underline">
                        Choose your subjects
                      </Link>
                      .
                    </p>
                  )}
                </>
              ) : (
                /**
                 * Reachable and not an error: a semester whose curriculum is not
                 * configured yet. The profile is still complete, because
                 * subjects are not part of the completeness bar.
                 */
                <p className="py-2 text-[14px] text-slate-500 dark:text-slate-400">
                  No subjects are configured for this semester yet.
                </p>
              )}
            </Card>
          )}
        </>
      ) : (
        <Card title="Academic details">
          <p className="py-2 text-[14px] text-slate-500 dark:text-slate-400">
            You have not set these up yet.{" "}
            <Link
              href="/onboarding/academic"
              className="font-semibold text-blue-700 underline dark:text-blue-400"
            >
              Add your academic details
            </Link>
            .
          </p>
        </Card>
      )}
    </div>
  );
}

const AUTONOMY_LABELS: Record<string, string> = {
  autonomous: "Autonomous",
  "non-autonomous": "Non-autonomous",
  "university-controlled": "University controlled",
  "not-applicable": "Not applicable",
};

/**
 * The institution type, without saying the same thing twice.
 *
 * `institutionType` is often already "Autonomous College", so appending the
 * autonomy status verbatim reads as a bug to the student even though both
 * fields are correct.
 */
function institutionLabel(college: ResolvedStudentContext["college"]): string | null {
  if (!college) return null;
  const autonomy = AUTONOMY_LABELS[college.autonomyStatus] ?? college.autonomyStatus;
  if (college.institutionType.toLowerCase().includes(autonomy.toLowerCase())) {
    return college.institutionType;
  }
  return `${college.institutionType} · ${autonomy}`;
}

/** Same idea: most regulations are named after their own code. */
function regulationLabel(regulation: ResolvedStudentContext["regulation"]): string | null {
  if (!regulation) return null;
  if (!regulation.name || regulation.name.includes(regulation.code)) return regulation.code;
  return `${regulation.code} — ${regulation.name}`;
}

// ── Presentational pieces ───────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  note,
  noteTone = "muted",
}: {
  label: string;
  value: string | null;
  note?: string;
  noteTone?: "ok" | "warn" | "muted";
}) {
  const noteStyle =
    noteTone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : noteTone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-400 dark:text-slate-500";

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className="text-[13px] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right">
        <span className="text-[14px] text-slate-900 dark:text-white">
          {value ?? <span className="text-slate-400 dark:text-slate-600">Not set</span>}
        </span>
        {note && <span className={`ml-2 text-[12px] ${noteStyle}`}>{note}</span>}
      </span>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";

  return (
    <p className={`rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${styles}`}>
      {children}
    </p>
  );
}
