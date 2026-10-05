import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ServiceRequestList } from "@/components/app/service-request-screens";
import { getCurrentUser } from "@/lib/current-user";
import { listForStudent } from "@/lib/service-requests/service";

export const metadata: Metadata = { title: "Service Requests · EduPilot" };

/**
 * Platform support, student side.
 *
 * Scoped to EduPilot itself — accounts, payments, curriculum data, the AI
 * tutor, coursework and bugs. Campus administration is somebody else's queue.
 *
 * Server-rendered so the list is complete on arrival — somebody opening this is
 * usually checking whether anything moved, and a flash of "nothing here" answers
 * that question wrongly.
 */
export default async function Page(props: PageProps<"/service-requests">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await props.searchParams;
  const raw = typeof params.filter === "string" ? params.filter : "open";
  const filter = raw === "closed" || raw === "all" ? raw : "open";

  const { cards, counts } = await listForStudent(user.id, { filter });

  return <ServiceRequestList initial={cards} counts={counts} filter={filter} />;
}
