import { ok, withPermission } from "@/lib/admin/ai/api";
import { listQueue, type QueueFilter } from "@/lib/service-requests/admin";

/**
 * GET /api/admin/service-requests — the desk's queue.
 *
 * Scoped to the administrator's own college when they have one. There is no
 * college parameter: the scope comes from their record, so a college admin
 * cannot express "show me another institution's requests".
 */
const FILTERS: QueueFilter[] = ["open", "unassigned", "mine", "overdue", "closed", "all"];

export async function GET(req: Request) {
  return withPermission("service_request.view", async (admin) => {
    const params = new URL(req.url).searchParams;
    const requested = params.get("filter") as QueueFilter | null;

    return ok(
      await listQueue(
        { id: admin.id, collegeId: admin.collegeId },
        {
          filter: requested && FILTERS.includes(requested) ? requested : "open",
          category: params.get("category"),
          search: params.get("q"),
          limit: Number(params.get("limit")) || 25,
          skip: Number(params.get("skip")) || 0,
        }
      )
    );
  });
}
