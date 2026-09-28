import type { Metadata } from "next";
import Link from "next/link";
import { Cell, Column, DataTable, PrimaryCell, Row } from "@/components/admin/data-table";
import { Badge, Card, EmptyState, PageHeader, type BadgeTone } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatNumber, formatRelative } from "@/lib/admin/format";
import type { SearchParams } from "@/lib/admin/query";
import { getReviewQueue, listSubjectsWithTopics } from "@/lib/admin/data/topic-content";
import type { TopicContentStatus } from "@/lib/learning/fields";

export const metadata: Metadata = { title: "Topic Content" };

const BASE = "/admin/ai/topic-content";

/**
 * Topic Content — the entry point for the workflow in §45.
 *
 * Two lists, in the order the work actually happens:
 *
 *   1. **What is waiting for a reviewer.** Put first because it is somebody's
 *      queue: content already generated and sitting in draft is the state that
 *      costs money and delivers nothing until a person acts on it.
 *   2. **Subjects with topics**, so an operator can go and generate more.
 *
 * A subject search rather than the four-step academic cascade the course
 * content screen uses. An operator arriving here already knows which subject
 * they are working on, and four dependent dropdowns would be four round trips
 * before any work starts.
 */

const QUEUE_COLUMNS: Column[] = [
  { key: "topic", label: "Topic" },
  { key: "subject", label: "Subject" },
  { key: "college", label: "College", secondary: true },
  { key: "status", label: "Status" },
  { key: "origin", label: "Written by", secondary: true },
  { key: "updated", label: "Updated", secondary: true },
];

const SUBJECT_COLUMNS: Column[] = [
  { key: "subject", label: "Subject" },
  { key: "context", label: "Context", secondary: true },
  { key: "topics", label: "Topics", numeric: true },
  { key: "published", label: "Published", numeric: true },
  { key: "coverage", label: "Coverage" },
];

export default async function TopicContentPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("topic_content.view", BASE);

  const params = (await props.searchParams) as SearchParams;
  const search = typeof params.q === "string" ? params.q : "";

  const [queue, subjects] = await Promise.all([
    getReviewQueue({ limit: 25 }),
    listSubjectsWithTopics({ search, limit: 40 }),
  ]);

  return (
    <>
      <PageHeader
        title="Topic Content"
        description="The prepared explanation a student reads when they open a topic — written in advance so the topic page needs no AI request. Generated content is a draft until a person reads it and approves it."
        breadcrumbs={[{ label: "AI & Learning" }, { label: "Topic Content" }]}
        meta={
          queue.length > 0 ? (
            <Badge tone="warning">{formatNumber(queue.length)} awaiting review</Badge>
          ) : (
            <Badge tone="success">Nothing awaiting review</Badge>
          )
        }
      />

      <Card
        title="Awaiting review"
        description="Drafts and in-review content. Approved content is waiting on a publisher, which is a separate permission — it is not in this list."
      >
        <DataTable
          columns={QUEUE_COLUMNS}
          basePath={BASE}
          params={params}
          rowCount={queue.length}
          empty={
            <EmptyState
              title="Nothing is waiting"
              description="Every generated explanation has been reviewed. Generate content for a subject below to add to the queue."
            />
          }
        >
          {queue.map((entry) => (
            <Row key={entry.contentId} highlighted={entry.status === "ai-draft"}>
              <PrimaryCell
                href={`${BASE}/${entry.subjectId}`}
                title={entry.topicTitle}
                subtitle={entry.subjectCode}
              />
              <Cell>{entry.subjectName}</Cell>
              <Cell secondary muted>
                {entry.collegeName ?? "—"}
              </Cell>
              <Cell>
                <StatusBadge status={entry.status} />
              </Cell>
              <Cell secondary muted>
                {/*
                  "Written by" rather than "provider": a reviewer needs to know
                  whether a person or a model produced the text, and which model
                  is a detail they cannot act on.
                */}
                {entry.origin === "authored" ? "A person" : `AI (${entry.provider ?? "unknown"})`}
              </Cell>
              <Cell secondary muted nowrap>
                {entry.updatedAt ? formatRelative(new Date(entry.updatedAt)) : "—"}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      <div className="mt-6">
        <Card
          title="Subjects"
          description="Every subject whose syllabus has been materialised into topics. Coverage is how many of those topics have a published explanation."
          actions={
            <form action={BASE} className="flex items-center gap-2">
              <label htmlFor="subject-search" className="sr-only">
                Search subjects
              </label>
              <input
                id="subject-search"
                name="q"
                defaultValue={search}
                placeholder="Subject, code or college"
                className="w-56 rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </form>
          }
        >
          <DataTable
            columns={SUBJECT_COLUMNS}
            basePath={BASE}
            params={params}
            rowCount={subjects.length}
            empty={
              <EmptyState
                title={search ? "No subjects match that search" : "No topics have been materialised"}
                description={
                  search
                    ? "Try the subject code, or the college name."
                    : "Run `npm run seed:topics` to build topic rows from the syllabus already in the curriculum."
                }
              />
            }
          >
            {subjects.map((subject) => {
              const coverage = subject.topicCount
                ? Math.round((subject.publishedCount / subject.topicCount) * 100)
                : 0;

              return (
                <Row key={subject.id}>
                  <PrimaryCell
                    href={`${BASE}/${subject.id}`}
                    title={subject.name}
                    subtitle={subject.code}
                  />
                  <Cell secondary muted>
                    {[subject.collegeName, subject.branchName, subject.regulationCode]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </Cell>
                  <Cell numeric>{formatNumber(subject.topicCount)}</Cell>
                  <Cell numeric>{formatNumber(subject.publishedCount)}</Cell>
                  <Cell>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <span
                          className="block h-full rounded-full bg-blue-600"
                          style={{ width: `${coverage}%` }}
                        />
                      </span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {coverage}%
                      </span>
                    </span>
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
        </Card>
      </div>

      <p className="mt-5 text-[12.5px] leading-relaxed text-slate-400 dark:text-slate-500">
        Nothing generated here reaches a student until it is approved and then published, and
        publishing needs its own permission. Content produced by the mock provider is refused at
        publish time —{" "}
        <Link href="/admin/ai/settings" className="underline hover:text-slate-600">
          configure a real provider
        </Link>{" "}
        before generating anything a student will read.
      </p>
    </>
  );
}

/**
 * Exported so the per-subject screen renders the same badge for the same
 * status. Two copies of this mapping is how one screen ends up calling
 * `editor-review` amber and the other one blue.
 */
export function StatusBadge({ status }: { status: TopicContentStatus | null }) {
  if (!status) return <Badge tone="neutral">Not written</Badge>;

  const tones: Record<TopicContentStatus, BadgeTone> = {
    "ai-draft": "warning",
    "editor-review": "info",
    approved: "purple",
    published: "success",
    archived: "neutral",
  };

  const labels: Record<TopicContentStatus, string> = {
    "ai-draft": "AI draft",
    "editor-review": "In review",
    approved: "Approved",
    published: "Published",
    archived: "Archived",
  };

  return <Badge tone={tones[status]}>{labels[status]}</Badge>;
}
