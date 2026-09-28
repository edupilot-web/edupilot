import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TeacherLoginForm } from "@/components/teacher/teacher-auth-forms";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { safeDestination } from "@/lib/redirects";

export const metadata: Metadata = { title: "Teacher sign in · EduPilot" };

/**
 * Outside the teacher shell, in its own route group, so the layout that gates
 * on the teacher role does not apply here — a teacher signing in does not have
 * a session yet, and a gate on this page would be a redirect loop.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await getCurrentTeacher();
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  // Already signed in as a teacher: there is nothing to do here.
  if (teacher) redirect(safeDestination(next, "/teacher/dashboard"));

  return <TeacherLoginForm next={next ? safeDestination(next, "") || undefined : undefined} />;
}
