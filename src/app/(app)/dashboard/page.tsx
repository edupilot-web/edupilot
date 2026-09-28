import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AssignmentsCard,
  ComingSoonCard,
  NotesCard,
  SemesterCard,
  StudyCard,
} from "@/components/app/dashboard-cards";
import { getCurrentUser } from "@/lib/current-user";
import { getDashboard } from "@/lib/dashboard-data";

export const metadata: Metadata = { title: "Dashboard · EduPilot" };

/**
 * Server time, not the reader's. Fine for a single-campus product; it would
 * need the browser's clock (or a stored timezone) to be right for everyone.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  // The layout has already gated this, and getCurrentUser is request-cached,
  // so this neither re-queries nor trusts the layout to have checked.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const firstName = user.name.trim().split(/\s+/)[0];

  /**
   * One loader for the whole screen. The cards are rendered together, so six
   * separate queries would be six round trips to paint one page — and they
   * share the profile read that resolves the semester.
   */
  const data = await getDashboard(user.id);

  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight text-slate-900 sm:text-[32px] dark:text-white">
        {greeting()}, {firstName}! <span aria-hidden="true">👋</span>
      </h1>
      <p className="mt-1.5 text-[15px] text-slate-500 dark:text-slate-400">
        Let&apos;s make today a productive step towards your future.
      </p>

      {/*
        grid-cols-1 rather than a bare `grid`: the implicit track is sized to
        min-content, which lets a card that cannot shrink (a nowrap `truncate`
        line) widen the column past the viewport. minmax(0,1fr) caps it so the
        cards elide instead.
      */}
      <div className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SemesterCard data={data} />
        <AssignmentsCard data={data} />
        <StudyCard data={data} />
        <NotesCard data={data} />
        <ComingSoonCard />
      </div>
    </div>
  );
}
