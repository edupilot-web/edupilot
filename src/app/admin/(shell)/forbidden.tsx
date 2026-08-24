import Link from "next/link";
import { ShieldIcon } from "@/components/admin/icons";
import { BUTTON_STYLES } from "@/components/admin/ui";

/**
 * The 403 an admin sees when `requirePermission` refuses.
 *
 * It says plainly what happened and who can change it. The alternative — a
 * silent redirect to the dashboard — reads as a broken link, and the operator
 * files a bug instead of asking for the permission they actually need.
 *
 * It deliberately does not name the permission. "You need `student.view_pii`"
 * is a string from an internal catalogue; "ask whoever manages your role" is
 * what the person can act on.
 */
export default function AdminForbidden() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
        <ShieldIcon className="h-6 w-6" />
      </span>

      <h1 className="mt-4 text-[19px] font-semibold tracking-tight text-slate-900 dark:text-white">
        Your role does not cover this screen
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
        You are signed in, but this section needs a permission your role has not been granted. Ask a
        Super Admin to adjust it if you need access.
      </p>

      <div className="mt-6 flex justify-center gap-2">
        <Link href="/admin" className={BUTTON_STYLES.primary}>
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
