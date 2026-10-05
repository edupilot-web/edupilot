import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ServiceRequestDetail } from "@/components/app/service-request-screens";
import { getCurrentUser } from "@/lib/current-user";
import { getForStudent } from "@/lib/service-requests/service";

export async function generateMetadata(
  props: PageProps<"/service-requests/[id]">
): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: "Service request · EduPilot" };

  const { id } = await props.params;
  const request = await getForStudent(user.id, id);
  return { title: request ? `${request.ticket} · EduPilot` : "Service request · EduPilot" };
}

/**
 * One request and its conversation.
 *
 * `getForStudent` scopes on `studentId` inside the query, so another student's
 * request simply does not resolve — "not yours" and "does not exist" are the
 * same 404, which stops an id being probed to learn what anyone else has asked
 * for. It also clears this student's unread marker, which is why it is called
 * here rather than in a cached read.
 */
export default async function Page(props: PageProps<"/service-requests/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await props.params;
  const request = await getForStudent(user.id, id);
  if (!request) notFound();

  return <ServiceRequestDetail request={request} />;
}
