import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { countTeacherSubjects } from "@/lib/teaching/teacher-view";

/**
 * Gate and chrome for every teacher screen.
 *
 * `proxy.ts` bounces requests with no session cookie, but a proxy cannot verify
 * a token and cannot read a role — so this is the authority. `getCurrentTeacher`
 * checks the role on the *database* record rather than on the token, which is
 * what makes a deactivation take effect on the next page load instead of
 * whenever a thirty-day cookie happens to expire.
 *
 * A student who reaches a `/teacher/*` URL is sent to their own dashboard
 * rather than to a sign-in page: they have a perfectly good session, it is
 * simply not one that belongs here.
 */
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  /**
   * An unverified teacher goes to the same verification screen students use
   * (§5). Nothing here would work for them, and the screen that fixes it
   * already exists.
   */
  if (!teacher.emailVerified) redirect("/verify-email");

  const subjectCount = await countTeacherSubjects(teacher);

  return (
    <TeacherShell
      name={teacher.name}
      collegeName={teacher.collegeName}
      status={teacher.status}
      canPublish={teacher.canPublish}
      subjectCount={subjectCount}
    >
      {children}
    </TeacherShell>
  );
}
