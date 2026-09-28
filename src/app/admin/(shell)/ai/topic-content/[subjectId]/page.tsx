import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader, Badge } from "@/components/admin/ui";
import { SubjectContentWorkbench } from "@/components/admin/ai/topic-content-workbench";
import { requirePermission } from "@/lib/admin/current-admin";
import { hasPermission } from "@/lib/admin/permissions";
import { getSubjectContent } from "@/lib/admin/data/topic-content";

const BASE = "/admin/ai/topic-content";

export async function generateMetadata(
  props: PageProps<"/admin/ai/topic-content/[subjectId]">
): Promise<Metadata> {
  const { subjectId } = await props.params;
  const view = await getSubjectContent(subjectId);
  return { title: view ? `${view.subject.code} · Topic Content` : "Topic Content" };
}

/**
 * One subject's topics, and the state of each one's explanation.
 *
 * The row is the **topic**, not the content document. A subject where nothing
 * has been generated is the normal starting state, and listing only the
 * content documents would render it as an empty screen that reads as broken
 * rather than as work to do.
 *
 * The three capabilities are checked here and passed down as booleans, so the
 * client component renders only the buttons this administrator can actually
 * use. That is a courtesy, not the enforcement: every action re-checks its own
 * permission server-side, because a hidden button is hidden and not forbidden.
 */
export default async function SubjectTopicContentPage(
  props: PageProps<"/admin/ai/topic-content/[subjectId]">
) {
  const { subjectId } = await props.params;
  const admin = await requirePermission("topic_content.view", `${BASE}/${subjectId}`);

  const view = await getSubjectContent(subjectId);
  if (!view) notFound();

  const written = view.rows.length - view.counts.none;
  const coverage = view.rows.length
    ? Math.round((view.counts.published / view.rows.length) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title={view.subject.name}
        description={[
          view.subject.collegeName,
          view.subject.branchName,
          view.subject.regulationCode,
          `Year ${view.subject.year}, Semester ${view.subject.semester}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[
          { label: "AI & Learning" },
          { label: "Topic Content", href: BASE },
          { label: view.subject.code },
        ]}
        meta={
          <>
            <Badge tone="neutral">{view.rows.length} topics</Badge>
            <Badge tone={coverage === 100 ? "success" : "info"}>{coverage}% published</Badge>
          </>
        }
      />

      <Card
        title="Topics"
        description={`${written} of ${view.rows.length} have an explanation written. Generating drafts a new one; nothing reaches a student until it is approved and then published.`}
      >
        <SubjectContentWorkbench
          rows={view.rows}
          can={{
            generate: hasPermission(admin.permissions, "topic_content.generate"),
            review: hasPermission(admin.permissions, "topic_content.review"),
            publish: hasPermission(admin.permissions, "topic_content.publish"),
          }}
        />
      </Card>

      <p className="mt-5 text-[12.5px] leading-relaxed text-slate-400 dark:text-slate-500">
        Generated explanations are grounded on this subject&apos;s own syllabus unit — the model is
        given the unit&apos;s topic list and told not to write about the other topics, each of which
        has its own page. Read the draft against the syllabus before approving it.
      </p>
    </>
  );
}
