import { redirect } from "next/navigation";

/**
 * `/admin/system/imports` and `/admin/imports` are the same list.
 *
 * The sidebar names it under both Institution Management (where the work is)
 * and System (where the operator looks when something failed), so one is a
 * redirect rather than a second copy that could drift.
 */
export default function SystemImportsPage() {
  redirect("/admin/imports");
}
