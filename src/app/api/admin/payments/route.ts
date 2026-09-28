import { ok, withPermission } from "@/lib/admin/ai/api";
import { listLedger } from "@/lib/payments/admin";

/**
 * GET /api/admin/payments — the transaction ledger.
 *
 * Every movement across every wallet, newest first, with the running totals a
 * reconciliation starts from. Offset pagination here rather than a cursor: an
 * admin table has page numbers and a total, and the drift an offset suffers
 * matters far less than being unable to jump to page four.
 */
export async function GET(req: Request) {
  return withPermission("payment.view", async () => {
    const params = new URL(req.url).searchParams;

    return ok(
      await listLedger({
        type: params.get("type"),
        userId: params.get("userId"),
        search: params.get("q"),
        limit: Number(params.get("limit")) || 25,
        skip: Number(params.get("skip")) || 0,
      })
    );
  });
}
