import type { Metadata } from "next";
import Link from "next/link";
import { BuildingIcon, ChartIcon, DatabaseIcon, ShieldCheckIcon, SparkIcon } from "@/components/admin/icons";
import { AlertIcon, ClockIcon, PlusIcon } from "@/components/icons";
import { BUTTON_STYLES, Badge, Card, PageHeader, StatTile } from "@/components/admin/ui";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { getAiSummary, listAiContent, listGenerationJobs } from "@/lib/admin/data/ai-content";
import { AI_CONTENT_STATUS_LABELS, type AiContentStatus } from "@/lib/admin/ai/fields";
import { formatRelative } from "@/lib/admin/format";
import { resolveAiSettings } from "@/lib/admin/ai/settings";

export const metadata: Metadata = { title: "AI Course Content" };

/**
 * The AI Course Content landing page (spec §3).
 *
 * A summary and two recent lists rather than the generation form itself. The
 * form lives at `/create` because it is a task with its own state, and a
 * landing page that started mid-task would give an operator no way to see what
 * has already been generated.
 */
export default async function AiCourseContentPage() {
  const admin = await requirePermission("ai_course_content.view", "/admin/ai/course-content");

  const [summary, recent, jobs, settings] = await Promise.all([
    getAiSummary(),
    listAiContent({ limit: "6" }),
    listGenerationJobs({ limit: "5" }),
    resolveAiSettings(),
  ]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="AI Course Content"
        description="Generate, manage and publish AI-powered learning content mapped to your academic curriculum."
        breadcrumbs={[{ label: "AI & Learning" }, { label: "AI Course Content" }]}
        meta={
          <Badge tone={settings.providerType === "mock" ? "warning" : "success"}>
            {settings.providerType === "mock" ? "Mock provider" : `${settings.providerType} · ${settings.model}`}
          </Badge>
        }
        actions={
          <>
            <Link href="/admin/ai/generation-jobs" className={BUTTON_STYLES.secondary}>
              Generation Jobs
            </Link>
            <Link href="/admin/ai/content-library" className={BUTTON_STYLES.secondary}>
              Content Library
            </Link>
            {can(admin, "ai_course_content.generate") && (
              <Link href="/admin/ai/course-content/create" className={BUTTON_STYLES.primary}>
                <PlusIcon className="h-3.5 w-3.5" />
                Generate Content
              </Link>
            )}
          </>
        }
      />

      {/*
        The mock is the default, so a deployment that has not configured a
        provider is generating placeholder text. That is fine for walking the
        flow and disastrous if it went unnoticed, so it is said here rather than
        only on the settings screen.
      */}
      {settings.providerType === "mock" && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <strong className="font-semibold">No AI provider is enabled.</strong> Generation runs against the
          mock provider, which produces clearly-marked placeholder text that cannot be published.{" "}
          {settings.fellBackFrom
            ? `A ${settings.fellBackFrom} configuration is enabled but is missing its server credentials.`
            : "Enable one in AI Settings."}{" "}
          <Link href="/admin/ai/settings" className="font-medium underline">
            AI Settings
          </Link>
        </p>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total Subjects" value={summary.totalSubjects} tone="info" icon={BuildingIcon} />
        <StatTile label="Content Generated" value={summary.contentGenerated} tone="purple" icon={SparkIcon} />
        <StatTile
          label="Published"
          value={summary.published}
          tone="success"
          icon={ShieldCheckIcon}
          href="/admin/ai/content-library?status=published"
        />
        <StatTile
          label="Drafts"
          value={summary.drafts}
          tone="warning"
          icon={ClockIcon}
          href="/admin/ai/content-library?status=generated"
        />
        <StatTile label="Generation Jobs" value={summary.jobs} tone="neutral" icon={DatabaseIcon} href="/admin/ai/generation-jobs" />
        <StatTile
          label="Failed Jobs"
          value={summary.failedJobs}
          tone="danger"
          icon={AlertIcon}
          href="/admin/ai/generation-jobs?status=failed"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          title="Recent content"
          description="The latest generated or edited content."
          actions={
            <Link href="/admin/ai/content-library" className={BUTTON_STYLES.ghost}>
              View all
            </Link>
          }
          padded={false}
        >
          {recent.rows.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/admin/ai/course-content/${row.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                        {row.subjectName ?? row.title}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                        {row.contentTypeLabel} · {row.regulationCode} · {row.branchName} · v{row.versionCount}
                      </span>
                    </span>
                    <StatusBadge status={row.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
              Nothing generated yet. Start by selecting an academic context.
            </p>
          )}
        </Card>

        <Card
          title="Recent jobs"
          description="Generation runs and what became of them."
          actions={
            <Link href="/admin/ai/generation-jobs" className={BUTTON_STYLES.ghost}>
              View all
            </Link>
          }
          padded={false}
        >
          {jobs.rows.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs.rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-slate-800 dark:text-slate-100">
                      <span className="font-mono text-[12px] text-slate-500 dark:text-slate-400">
                        {row.reference}
                      </span>{" "}
                      {row.subjectName}
                    </span>
                    <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                      {row.contentTypeLabel} · {row.provider ?? "—"} ·{" "}
                      {row.completedAt ? formatRelative(row.completedAt) : row.status}
                    </span>
                  </span>
                  <Badge
                    tone={
                      row.status === "completed"
                        ? "success"
                        : row.status === "failed"
                          ? "danger"
                          : row.status === "cancelled"
                            ? "neutral"
                            : "warning"
                    }
                  >
                    {row.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
              No generation jobs yet.
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-3" title="How this works" description="The guarantees the module is built on.">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {[
            ["Curriculum-grounded", "Content follows the subject's own syllabus units. The generator is refused if there is no syllabus to ground on."],
            ["Context-verified", "The college → programme → branch → regulation → semester → subject chain is re-verified on the server. Names sent by the browser are discarded."],
            ["Never auto-published", "Generation produces a draft. A human reviews, approves and publishes — and publishing needs its own permission."],
            ["Versioned", "Every generation, edit and restore writes a version. Published versions are immutable."],
            ["Asynchronous", "Requests create a job. Nothing holds the browser open while a model runs, and failures can be retried."],
            ["Provider-agnostic", "The model sits behind an interface. Switching Gemini for a local Ollama changes configuration, not the UI or the database."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-2">
              <ChartIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <span>
                <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-100">{title}. </span>
                <span className="text-[12.5px] text-slate-600 dark:text-slate-400">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function StatusBadge({ status }: { status: AiContentStatus }) {
  const tone =
    status === "published"
      ? "success"
      : status === "approved"
        ? "info"
        : status === "failed"
          ? "danger"
          : status === "archived"
            ? "neutral"
            : status === "generating"
              ? "purple"
              : "warning";

  return <Badge tone={tone}>{AI_CONTENT_STATUS_LABELS[status] ?? status}</Badge>;
}
