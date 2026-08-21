import Link from "next/link";
import type { ReactNode } from "react";
import { AlertIcon, CheckCircleIcon, ClockIcon } from "@/components/icons";

export type ResultTone = "success" | "expired" | "invalid";

const TONE: Record<
  ResultTone,
  { icon: ReactNode; wrapper: string }
> = {
  success: {
    icon: <CheckCircleIcon className="h-7 w-7" />,
    wrapper: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  expired: {
    icon: <ClockIcon className="h-7 w-7" />,
    wrapper: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  invalid: {
    icon: <AlertIcon className="h-7 w-7" />,
    wrapper: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  },
};

/**
 * Outcome of following a verification link.
 *
 * Every state ends in exactly one obvious next action. A student who clicked an
 * old link and is told only that it is old has been given a dead end, which is
 * the one thing this screen must never be.
 */
export function VerificationResult({
  tone,
  title,
  description,
  primary,
  secondary,
}: {
  tone: ResultTone;
  title: string;
  description: string;
  primary?: { href: string; label: string };
  secondary?: ReactNode;
}) {
  const style = TONE[tone];

  return (
    <div className="text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${style.wrapper}`}>
        {style.icon}
      </span>

      <h1 className="mt-4 text-[23px] font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>

      {primary && (
        <Link
          href={primary.href}
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-[15px] font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          {primary.label}
        </Link>
      )}

      {secondary && <div className="mt-4">{secondary}</div>}
    </div>
  );
}
