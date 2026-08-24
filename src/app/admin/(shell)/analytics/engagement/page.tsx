import { NotBuilt } from "@/components/admin/not-built";
import { requireAdmin } from "@/lib/admin/current-admin";

export default async function Page() {
  await requireAdmin("/admin/analytics/engagement");
  return <NotBuilt pathname="/admin/analytics/engagement" />;
}
