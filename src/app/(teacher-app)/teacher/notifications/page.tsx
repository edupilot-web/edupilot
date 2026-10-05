import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationCenter } from "@/components/app/notification-center";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { listNotifications, unreadCount } from "@/lib/notifications/service";

export const metadata: Metadata = { title: "Notifications · EduPilot for teachers" };

/**
 * A teacher's notifications.
 *
 * `TEACHER_APPROVED` and `TEACHER_REJECTED` are addressed to teachers and have
 * always been written; nothing displayed them, so the one message that tells
 * somebody their account is now usable went into the database and stopped
 * there. That is the gap this page closes.
 *
 * Reuses the student notification centre rather than getting its own. The
 * service is keyed on `recipientId`, which is a `User` and not a student, and
 * every href the rows carry already resolves for a teacher — so a second
 * implementation would differ only in the shell around it.
 */
export default async function Page() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const [{ notifications, nextCursor }, unread] = await Promise.all([
    listNotifications(teacher.userId, { limit: 20 }),
    unreadCount(teacher.userId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <NotificationCenter initial={notifications} initialCursor={nextCursor} unread={unread} />
    </div>
  );
}
