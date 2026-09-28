import Link from "next/link";
import { BookIcon, ChatIcon, ChevronRightIcon, RobotIcon } from "@/components/icons";
import { APP_ROUTES } from "@/lib/app-routes";
import { DEPTH_LEVEL_LABELS, type DepthLevel } from "@/lib/learning/fields";
import type { SubjectCard } from "@/lib/curriculum/student-curriculum";
import type { ConversationView } from "@/lib/tutor/history";

/**
 * The AI Tutor hub.
 *
 * A server component: everything on it is already resolved, nothing here is
 * interactive, and shipping a client bundle for a list of links would be a cost
 * paid by every student on a slow connection for no behaviour (§78).
 *
 * The quota is stated up front rather than discovered at the moment a question
 * is refused. A student who finds out they are out of questions *after*
 * composing one has been given a worse experience than one who could see it
 * coming (§33).
 */
export function AiTutorHub({
  conversations,
  quota,
  subjects,
  positionLabel,
}: {
  conversations: ConversationView[];
  quota: { used: number; limit: number; remaining: number };
  subjects: SubjectCard[];
  positionLabel: string;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white">
          <RobotIcon className="h-5 w-5" />
        </span>

        <h1 className="mt-3.5 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          AI Tutor
        </h1>
        <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          The tutor works inside your topics, not in a separate chat — so every answer is grounded
          on your own syllabus, your regulation and the unit you are reading. Open a topic and ask
          it there.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <span className="text-slate-500 dark:text-slate-400">{positionLabel}</span>
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              quota.remaining === 0
                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {quota.remaining === 0
              ? "No questions left today"
              : `${quota.remaining} of ${quota.limit} questions left today`}
          </span>
        </div>

        {quota.remaining === 0 && (
          <p className="mt-2.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            Your limit resets at midnight. Every answer you have already had is still readable, and
            re-reading one costs nothing.
          </p>
        )}
      </header>

      {conversations.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
            Your conversations
          </h2>
          <ul className="mt-3 space-y-2">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`${APP_ROUTES.curriculum}/${conversation.subjectId}/topics/${conversation.topicId}`}
                  className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <ChatIcon className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-slate-900 dark:text-white">
                      {/*
                        The stored title, then the topic. Both are snapshots
                        taken when the thread started, so a topic the college
                        has since renamed still reads the way the student
                        remembers it (§58).
                      */}
                      {conversation.title ?? conversation.topicTitle ?? "Untitled conversation"}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-400 dark:text-slate-500">
                      {conversation.subjectName && <span>{conversation.subjectName}</span>}
                      {conversation.topicTitle && <span>{conversation.topicTitle}</span>}
                      <span>{conversation.messageCount} messages</span>
                      <span>
                        {DEPTH_LEVEL_LABELS[conversation.depthLevel as DepthLevel] ??
                          conversation.depthLevel}
                      </span>
                    </span>
                  </span>

                  <ChevronRightIcon className="mt-2 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          {conversations.length > 0 ? "Start somewhere else" : "Pick a subject"}
        </h2>

        {subjects.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {subjects.map((subject) => (
              <li key={subject.id}>
                <Link
                  href={`${APP_ROUTES.curriculum}/${subject.id}`}
                  className="flex h-full items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    <BookIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-snug text-slate-900 dark:text-white">
                      {subject.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[12px] text-slate-400 dark:text-slate-500">
                      {subject.code}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-slate-200/80 bg-white p-5 text-[14px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Your curriculum has no subjects for this semester yet, so there is nothing for the tutor
            to be grounded on.{" "}
            <Link href={APP_ROUTES.curriculum} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
              Check your curriculum
            </Link>
            .
          </p>
        )}
      </section>

      <p className="mt-6 px-1 text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
        The AI tutor is study support. It is not your college, it does not set your syllabus, and
        nothing it writes is an official university answer — your syllabus is quoted separately on
        every topic page.
      </p>
    </div>
  );
}
