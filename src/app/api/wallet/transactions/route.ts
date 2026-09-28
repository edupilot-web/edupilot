import { handleError, ok, requireAuth } from "@/lib/api";
import { getStatement } from "@/lib/payments/wallet";

/**
 * GET /api/wallet/transactions — the statement, paged.
 *
 * Cursor pagination on `createdAt` rather than `skip`: a statement grows at the
 * top, so an offset shifts under the reader every time a payment lands and page
 * two silently repeats a row from page one.
 *
 * Scoped to the session's user inside the query. There is no parameter that
 * widens it, because there is no version of this question that is about somebody
 * else's money.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const params = new URL(req.url).searchParams;

    const statement = await getStatement(session.sub, {
      limit: Number(params.get("limit")) || 20,
      cursor: params.get("cursor"),
    });

    return ok({
      transactions: statement.transactions,
      nextCursor: statement.nextCursor,
      balancePaise: statement.balancePaise,
    });
  } catch (err) {
    return handleError(err);
  }
}
