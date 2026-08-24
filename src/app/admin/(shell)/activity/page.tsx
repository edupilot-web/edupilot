import { redirect } from "next/navigation";

/**
 * "Activity Summary" is the audit log with nothing filtered out.
 *
 * A redirect rather than a second, thinner rendering of the same rows — two
 * views of one collection drift, and the audit page already answers the
 * question this menu entry asks.
 */
export default function ActivitySummaryPage() {
  redirect("/admin/audit");
}
