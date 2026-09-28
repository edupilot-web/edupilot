import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TeacherSignupForm } from "@/components/teacher/teacher-auth-forms";
import { getCurrentTeacher } from "@/lib/teaching/teacher";

export const metadata: Metadata = { title: "Create a teacher account · EduPilot" };

export default async function Page() {
  const teacher = await getCurrentTeacher();
  if (teacher) redirect("/teacher/dashboard");

  return <TeacherSignupForm />;
}
