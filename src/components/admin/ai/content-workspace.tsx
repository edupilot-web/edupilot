"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BUTTON_STYLES, Badge, Card } from "@/components/admin/ui";
import { AI_CONTENT_STATUS_LABELS, nextStatuses, type AiContentStatus } from "@/lib/admin/ai/fields";

/**
 * The content workspace (spec §14, §17, §29, §30, §31).
 *
 * Three panes: the outline tree, the content itself, and the workflow rail. The
 * spec's editor also calls for an AI assistant panel and a rich text surface;
 * what is here is the review, workflow, version and preview half — the parts a
 * draft cannot be approved or published without. The assistant is stubbed
 * visibly rather than faked, so nobody mistakes an absent feature for a broken
 * one.
 *
 * Rendering is driven off the *shape* of the content rather than a per-type
 * component: a schema that gains a content type should not need a new renderer
 * before its output can be reviewed.
 */

type Version = {
  id: string;
  versionNumber: number;
  origin: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  provider: string | null;
  model: string | null;
  published: boolean;
  totalTokens: number | null;
  restoredFromVersion: number | null;
};

type Props = {
  contentId: string;
  contentType: string;
  contentTypeLabel: string;
  status: AiContentStatus;
  body: unknown;
  editBlockedReason: string | null;
  isMock: boolean;
  academicallyApproved: boolean;
  syllabusUnits: { unitNumber: number; title: string }[];
  versions: Version[];
  permissions: { edit: boolean; review: boolean; publish: boolean };
};

type Tab = "content" | "preview" | "versions" | "json";

export function ContentWorkspace(props: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("content");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);

  const units = useMemo(() => extractUnits(props.body), [props.body]);
  const lists = useMemo(() => extractLists(props.body), [props.body]);
  const overview = useMemo(() => extractOverview(props.body), [props.body]);
  const envelope = useMemo(() => extractEnvelope(props.body), [props.body]);

  /** Syllabus units the content does not cover (§25's completeness check, shown). */
  const missingUnits = props.syllabusUnits.filter(
    (unit) => !units.some((entry) => entry.unitNumber === unit.unitNumber)
  );

  const call = async (path: string, body: unknown, success: string) => {
    setBusy(true);
    setMessage(null);

    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setMessage({ tone: "error", text: payload?.error?.message ?? "That did not work." });
      return false;
    }
    setMessage({ tone: "ok", text: success });
    router.refresh();
    return true;
  };

  const moveTo = async (status: AiContentStatus, extra?: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/ai/course-content/${props.contentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setMessage({ tone: "error", text: payload?.error?.message ?? "The status could not be changed." });
      return;
    }
    setMessage({ tone: "ok", text: `Moved to ${AI_CONTENT_STATUS_LABELS[status]}.` });
    router.refresh();
  };

  const publish = async () => {
    // §30: the confirmation names exactly what goes live.
    const confirmed = window.confirm(
      `You are about to publish this AI-generated course content to students.\n\n` +
        `${props.contentTypeLabel}\nVersion ${props.versions[0]?.versionNumber ?? "?"}\n\n` +
        `It will become immutable. Continue?`
    );
    if (!confirmed) return;
    await call(`/api/admin/ai/course-content/${props.contentId}/publish`, { confirm: true }, "Published.");
  };

  const unpublish = async () => {
    // §31: a reason is required, and the server enforces a minimum length.
    const reason = window.prompt("Why is this being unpublished? It is recorded in the audit log.");
    if (!reason) return;
    await call(`/api/admin/ai/course-content/${props.contentId}/unpublish`, { reason }, "Unpublished.");
  };

  const restore = async (version: Version) => {
    const confirmed = window.confirm(
      `Restore version ${version.versionNumber}?\n\nThis writes a NEW version holding that content. Nothing is lost, and the current version stays in the history.`
    );
    if (!confirmed) return;
    await call(
      `/api/admin/ai/course-content/${props.contentId}/versions/${version.id}/restore`,
      {},
      `Restored version ${version.versionNumber} as a new version.`
    );
  };

  const forward = nextStatuses(props.status).filter((status) => status !== "generating" && status !== "published");

  return (
    <div className="grid gap-3 lg:grid-cols-[240px_1fr_260px]">
      {/* ── Outline tree (§14 left) ─────────────────────────────────────── */}
      <Card title="Outline" padded={false} className="lg:sticky lg:top-[64px] lg:self-start">
        <nav className="max-h-[60vh] overflow-y-auto p-2">
          {overview && (
            <button
              type="button"
              onClick={() => setSelectedUnit(null)}
              className={`mb-1 block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] transition ${
                selectedUnit === null
                  ? "bg-blue-50 font-medium text-blue-700 dark:bg-slate-700/60 dark:text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Course overview
            </button>
          )}

          {units.length > 0 ? (
            <ul className="space-y-px">
              {units.map((unit) => (
                <li key={unit.unitNumber}>
                  <button
                    type="button"
                    onClick={() => setSelectedUnit(unit.unitNumber)}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] transition ${
                      selectedUnit === unit.unitNumber
                        ? "bg-blue-50 font-medium text-blue-700 dark:bg-slate-700/60 dark:text-white"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="block truncate">
                      Unit {unit.unitNumber}: {unit.title}
                    </span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                      {unit.topics.length} topic{unit.topics.length === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-2 text-[12px] text-slate-400 dark:text-slate-500">
              This content type has no unit structure.
            </p>
          )}

          {missingUnits.length > 0 && (
            <div className="mt-2 border-t border-slate-100 px-2 pt-2 dark:border-slate-800">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-amber-600 dark:text-amber-400">
                Not covered
              </p>
              <ul className="mt-1 space-y-0.5">
                {missingUnits.map((unit) => (
                  <li key={unit.unitNumber} className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                    Unit {unit.unitNumber}: {unit.title}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                Generate these units individually rather than regenerating the subject.
              </p>
            </div>
          )}
        </nav>
      </Card>

      {/* ── Content (§14 centre, §29 preview) ──────────────────────────── */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(["content", "preview", "versions", "json"] as Tab[]).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setTab(entry)}
              aria-current={tab === entry ? "true" : undefined}
              className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium ring-1 ring-inset transition ${
                tab === entry
                  ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
              }`}
            >
              {entry === "json" ? "Structured JSON" : entry === "preview" ? "Preview as student" : entry === "versions" ? `Versions (${props.versions.length})` : "Content"}
            </button>
          ))}
        </div>

        {!props.body ? (
          <Card>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              No content yet. {props.status === "generating" ? "A generation job is running." : "Generate content for this subject."}
            </p>
          </Card>
        ) : tab === "versions" ? (
          <Card title="Version history" description="Every generation, edit and restore. Published versions are immutable." padded={false}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {props.versions.map((version, index) => (
                <li key={version.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-slate-800 dark:text-slate-100">
                      Version {version.versionNumber}
                      {index === 0 && <Badge tone="info">current</Badge>}
                      {version.published && <Badge tone="success">published</Badge>}
                      <span className="text-[11.5px] font-normal text-slate-400">{version.origin}</span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                      {new Date(version.createdAt).toLocaleString("en-IN")}
                      {version.createdBy ? ` · ${version.createdBy}` : ""}
                      {version.provider ? ` · ${version.provider}` : ""}
                      {version.totalTokens ? ` · ${version.totalTokens.toLocaleString("en-IN")} tokens` : ""}
                      {version.restoredFromVersion ? ` · restored from v${version.restoredFromVersion}` : ""}
                    </p>
                    {version.note && (
                      <p className="mt-0.5 text-[11.5px] text-slate-400 dark:text-slate-500">{version.note}</p>
                    )}
                  </div>
                  {index > 0 && props.permissions.edit && !props.editBlockedReason && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => restore(version)}
                      className="text-[12px] font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : tab === "json" ? (
          <Card
            title="Structured JSON"
            description="What is actually stored. Content is a validated tree, never an HTML blob."
          >
            <pre className="max-h-[70vh] overflow-auto rounded-lg bg-slate-50 p-3 text-[11.5px] leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              {JSON.stringify(props.body, null, 2)}
            </pre>
          </Card>
        ) : (
          <ContentBody
            units={units}
            lists={lists}
            overview={overview}
            selectedUnit={selectedUnit}
            studentPreview={tab === "preview"}
            isMock={props.isMock}
            academicallyApproved={props.academicallyApproved}
          />
        )}

        {envelope.unavailable.length > 0 && tab === "content" && (
          <Card title="Marked unavailable by the model" description="Fields it declined to invent. Fill these in from the curriculum document.">
            <ul className="space-y-1.5">
              {envelope.unavailable.map((entry, index) => (
                <li key={index} className="text-[12.5px] text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{entry.field}</span> — {entry.reason}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {envelope.reviewerNotes && tab === "content" && (
          <Card title="Notes for the reviewer" description="Written by the model. Never shown to a student.">
            <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
              {envelope.reviewerNotes}
            </p>
          </Card>
        )}
      </div>

      {/* ── Workflow rail (§14 right, §18, §30) ────────────────────────── */}
      <div className="space-y-3 lg:sticky lg:top-[64px] lg:self-start">
        <Card title="Review & publish">
          {message && (
            <p
              className={`mb-2 rounded-lg px-2.5 py-2 text-[12px] ${
                message.tone === "ok"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300"
              }`}
            >
              {message.text}
            </p>
          )}

          <p className="mb-2 text-[12px] text-slate-500 dark:text-slate-400">
            Current status: <span className="font-medium text-slate-800 dark:text-slate-100">{AI_CONTENT_STATUS_LABELS[props.status]}</span>
          </p>

          <div className="space-y-1.5">
            {props.permissions.review &&
              forward.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    moveTo(
                      status,
                      // §42: the "checked by a human" flag is only ever set here,
                      // by an explicit answer, and never by the generator.
                      status === "approved"
                        ? {
                            academicallyApproved: window.confirm(
                              "Mark this as academically checked?\n\nOnly do so if you have verified it against the curriculum. It is recorded against your name."
                            ),
                          }
                        : undefined
                    )
                  }
                  className={`${BUTTON_STYLES.secondary} w-full justify-center disabled:opacity-50`}
                >
                  Move to {AI_CONTENT_STATUS_LABELS[status]}
                </button>
              ))}

            {props.status === "approved" && props.permissions.publish && (
              <button
                type="button"
                disabled={busy || props.isMock}
                onClick={publish}
                className={`${BUTTON_STYLES.primary} w-full justify-center disabled:opacity-50`}
              >
                Publish to students
              </button>
            )}

            {props.status === "published" && props.permissions.publish && (
              <button
                type="button"
                disabled={busy}
                onClick={unpublish}
                className={`${BUTTON_STYLES.danger} w-full justify-center disabled:opacity-50`}
              >
                Unpublish
              </button>
            )}
          </div>

          {props.isMock && props.status === "approved" && (
            <p className="mt-2 text-[11.5px] leading-snug text-amber-700 dark:text-amber-400">
              Publishing is blocked: this is mock placeholder content.
            </p>
          )}

          {props.editBlockedReason && (
            <p className="mt-2 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
              {props.editBlockedReason}
            </p>
          )}

          {!props.permissions.review && !props.permissions.publish && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              You have read-only access to this content.
            </p>
          )}
        </Card>

        {/*
          The assistant panel §14 and §15 call for is not built yet.

          Said plainly rather than shown as a disabled set of buttons that look
          like they should work — an operator clicking "Improve" and getting
          nothing is worse than being told the feature is a later phase.
        */}
        <Card title="AI assistant" description="A later phase.">
          <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Improve, simplify, expand, translate and the other assisted edits are not built yet. The
            backend contract for them exists — a separate prompt that returns a <em>suggestion</em> and
            never applies it — so the panel can be added without changing how content is stored.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            In the meantime, regenerate a single unit from the generation screen to replace a weak
            section without touching the rest.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ── Rendering ────────────────────────────────────────────────────────────

type Unit = {
  unitNumber: number;
  title: string;
  description: string | null;
  topics: { topicNumber: number; title: string; content: string; keyPoints: string[] }[];
};

function ContentBody({
  units,
  lists,
  overview,
  selectedUnit,
  studentPreview,
  isMock,
  academicallyApproved,
}: {
  units: Unit[];
  lists: { key: string; label: string; items: unknown[] }[];
  overview: { title: string; description: string; learningObjectives: string[] } | null;
  selectedUnit: number | null;
  studentPreview: boolean;
  isMock: boolean;
  academicallyApproved: boolean;
}) {
  const shown = selectedUnit === null ? units : units.filter((unit) => unit.unitNumber === selectedUnit);

  return (
    <div className="space-y-3">
      {studentPreview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-[12px] text-slate-600 dark:text-slate-300">
            This is roughly how a student would read it.{" "}
            {/*
              Even in the student preview, unapproved content says so. A preview
              that looked finished is how unreviewed material gets signed off.
            */}
            {isMock
              ? "It is placeholder text and will never reach a student."
              : academicallyApproved
                ? "An administrator has marked it as checked against the curriculum."
                : "It is not yet approved, and a student would not see it."}
          </p>
        </div>
      )}

      {overview && (selectedUnit === null) && (
        <Card title={studentPreview ? overview.title : "Course overview"}>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
            {overview.description}
          </p>
          {overview.learningObjectives.length > 0 && (
            <>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
                Learning objectives
              </p>
              <ul className="mt-1.5 space-y-1">
                {overview.learningObjectives.map((objective, index) => (
                  <li key={index} className="flex gap-1.5 text-[12.5px] text-slate-700 dark:text-slate-300">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                    {objective}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {shown.map((unit) => (
        <Card key={unit.unitNumber} title={`Unit ${unit.unitNumber}: ${unit.title}`}>
          {unit.description && (
            <p className="mb-3 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
              {unit.description}
            </p>
          )}
          <div className="space-y-4">
            {unit.topics.map((topic) => (
              <div key={topic.topicNumber}>
                <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                  {topic.topicNumber}. {topic.title}
                </h4>
                <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {topic.content}
                </p>
                {topic.keyPoints.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {topic.keyPoints.map((point, index) => (
                      <li key={index} className="flex gap-1.5 text-[12px] text-slate-600 dark:text-slate-400">
                        <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {selectedUnit === null &&
        lists.map((list) => (
          <Card key={list.key} title={`${list.label} (${list.items.length})`} padded={false}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.items.slice(0, 40).map((item, index) => (
                <li key={index} className="px-4 py-2.5">
                  <ListItem item={item} />
                </li>
              ))}
            </ul>
            {list.items.length > 40 && (
              <p className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                Showing 40 of {list.items.length}. The full set is in the Structured JSON tab.
              </p>
            )}
          </Card>
        ))}
    </div>
  );
}

function ListItem({ item }: { item: unknown }) {
  if (!item || typeof item !== "object") {
    return <p className="text-[12.5px] text-slate-700 dark:text-slate-300">{String(item)}</p>;
  }

  const record = item as Record<string, unknown>;
  const heading = (record.question ?? record.front ?? record.title ?? record.heading) as string | undefined;
  const detail = (record.answer ?? record.back ?? record.body ?? record.aim ?? record.task ?? record.scenario) as
    | string
    | undefined;
  const options = Array.isArray(record.options) ? (record.options as string[]) : null;
  const answerIndex = typeof record.answerIndex === "number" ? record.answerIndex : null;

  return (
    <>
      {heading && (
        <p className="text-[12.5px] font-medium text-slate-800 dark:text-slate-100">
          {heading}
          {typeof record.marks === "number" && (
            <span className="ml-1.5 text-[11px] font-normal text-slate-400">{record.marks} marks</span>
          )}
          {typeof record.unitNumber === "number" && (
            <span className="ml-1.5 text-[11px] font-normal text-slate-400">Unit {record.unitNumber}</span>
          )}
        </p>
      )}
      {options && (
        <ol className="mt-1 space-y-0.5">
          {options.map((option, index) => (
            <li
              key={index}
              className={`text-[12px] ${
                index === answerIndex
                  ? "font-medium text-emerald-700 dark:text-emerald-400"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {String.fromCharCode(65 + index)}. {option}
              {index === answerIndex && " ✓"}
            </li>
          ))}
        </ol>
      )}
      {detail && (
        <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-600 dark:text-slate-400">
          {detail}
        </p>
      )}
      {typeof record.explanation === "string" && record.explanation && (
        <p className="mt-1 text-[11.5px] italic text-slate-500 dark:text-slate-500">{record.explanation}</p>
      )}
    </>
  );
}

// ── Shape extraction ────────────────────────────────────────────────────

/**
 * Read units out of any content shape.
 *
 * Shape-driven rather than type-driven so a new content type is reviewable the
 * moment its schema exists — a per-type renderer would mean generated content
 * that cannot be looked at until someone writes its view.
 */
function extractUnits(body: unknown): Unit[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as Record<string, unknown>).units;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      unitNumber: typeof entry.unitNumber === "number" ? entry.unitNumber : 0,
      title: typeof entry.title === "string" ? entry.title : "Untitled unit",
      description: typeof entry.description === "string" ? entry.description : null,
      topics: (Array.isArray(entry.topics) ? entry.topics : [])
        .filter((topic): topic is Record<string, unknown> => Boolean(topic) && typeof topic === "object")
        .map((topic, index) => ({
          topicNumber: typeof topic.topicNumber === "number" ? topic.topicNumber : index + 1,
          title: typeof topic.title === "string" ? topic.title : "Untitled topic",
          content: typeof topic.content === "string" ? topic.content : "",
          keyPoints: Array.isArray(topic.keyPoints)
            ? topic.keyPoints.filter((point): point is string => typeof point === "string")
            : [],
        })),
    }))
    .sort((a, b) => a.unitNumber - b.unitNumber);
}

const LIST_LABELS: Record<string, string> = {
  mcqs: "MCQs",
  questions: "Questions",
  shortAnswers: "Short answers",
  longAnswers: "Long answers",
  flashcards: "Flashcards",
  notes: "Notes",
  lessons: "Lessons",
  experiments: "Experiments",
  assignments: "Assignments",
  caseStudies: "Case studies",
  sections: "Sections",
  keyTakeaways: "Key takeaways",
  unitPriorities: "Unit priorities",
  learningObjectives: "Learning objectives",
  outcomes: "Course outcomes",
};

function extractLists(body: unknown): { key: string; label: string; items: unknown[] }[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;

  return Object.entries(LIST_LABELS)
    .filter(([key]) => Array.isArray(record[key]) && (record[key] as unknown[]).length > 0)
    .map(([key, label]) => ({ key, label, items: record[key] as unknown[] }));
}

function extractOverview(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const overview = record.courseOverview;
  if (!overview || typeof overview !== "object") {
    // `summary` types have no overview object but do have prose worth showing.
    if (typeof record.summary === "string" && record.summary) {
      return { title: "Summary", description: record.summary, learningObjectives: [] };
    }
    if (typeof record.strategy === "string" && record.strategy) {
      return { title: "Exam strategy", description: record.strategy, learningObjectives: [] };
    }
    return null;
  }

  const entry = overview as Record<string, unknown>;
  return {
    title: typeof entry.title === "string" ? entry.title : "Course overview",
    description: typeof entry.description === "string" ? entry.description : "",
    learningObjectives: Array.isArray(entry.learningObjectives)
      ? entry.learningObjectives.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function extractEnvelope(body: unknown) {
  const empty = { unavailable: [] as { field: string; reason: string }[], reviewerNotes: null as string | null };
  if (!body || typeof body !== "object") return empty;

  const record = body as Record<string, unknown>;
  return {
    unavailable: Array.isArray(record.unavailable)
      ? record.unavailable
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .map((entry) => ({
            field: String(entry.field ?? "unknown"),
            reason: String(entry.reason ?? ""),
          }))
      : [],
    reviewerNotes: typeof record.reviewerNotes === "string" ? record.reviewerNotes : null,
  };
}
