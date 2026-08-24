import { NotBuilt } from "@/components/admin/not-built";
import { requireAdmin } from "@/lib/admin/current-admin";

export default async function Page() {
  await requireAdmin("/admin/content/events");
  return <NotBuilt pathname="/admin/content/events" />;
}
