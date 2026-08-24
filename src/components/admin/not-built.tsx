import Link from "next/link";
import { SparkIcon } from "@/components/admin/icons";
import { Card, PageHeader } from "@/components/admin/ui";
import { navItemForPath } from "@/lib/admin/nav";

/**
 * The screen behind a sidebar entry whose page is not written yet.
 *
 * It says so plainly and names what the screen will do. The alternatives are
 * worse: a 404 reads as a broken link, and an empty table reads as "there is no
 * data", which is a different and misleading claim.
 */
export function NotBuilt({ pathname }: { pathname: string }) {
  const item = navItemForPath(pathname);

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title={item?.label ?? "Not built yet"}
        breadcrumbs={item ? [{ label: item.section }, { label: item.label }] : undefined}
      />

      <Card>
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <SparkIcon className="h-5 w-5" />
          </span>

          <p className="mt-3 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
            This screen is not built yet
          </p>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            {item?.blurb ??
              "This section is planned but has no screen behind it yet."}
          </p>
          <p className="mt-3 max-w-md text-[12.5px] leading-relaxed text-slate-400">
            The navigation entry is here because the section is part of the design. Showing an empty
            table instead would read as &ldquo;there is no data&rdquo;, which is a different claim
            from &ldquo;this is not written yet&rdquo;.
          </p>

          <Link
            href="/admin"
            className="mt-5 text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Back to the dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
