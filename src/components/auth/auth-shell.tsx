import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo, BrandMark } from "@/components/brand";
import { ChevronLeftIcon } from "@/components/icons";

export type FeatureTone = "blue" | "indigo" | "amber" | "emerald";

export type Feature = {
  icon: ReactNode;
  title: string;
  description: string;
  tone: FeatureTone;
};

const TONE_CLASSES: Record<FeatureTone, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
};

/** Dot grid and soft wave that sit behind the panel content. */
function PanelDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg className="absolute bottom-16 left-6 h-16 w-16 text-blue-200 dark:text-blue-500/20" viewBox="0 0 96 96">
        {[0, 1, 2, 3, 4, 5].map((row) =>
          [0, 1, 2, 3, 4, 5].map((col) => (
            <circle key={`${row}-${col}`} cx={4 + col * 16} cy={4 + row * 16} r="2.2" fill="currentColor" />
          ))
        )}
      </svg>
      <svg
        className="absolute -bottom-1 left-0 w-full text-blue-100/70 dark:text-blue-500/10"
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
      >
        <path d="M0 64c96-40 192-40 300-8s204 32 300-8v72H0V64Z" fill="currentColor" />
      </svg>
    </div>
  );
}

function FeatureList({ features }: { features: Feature[] }) {
  return (
    <ul className="space-y-5">
      {features.map((feature) => (
        <li key={feature.title} className="flex gap-3.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${TONE_CLASSES[feature.tone]} [&>svg]:h-[18px] [&>svg]:w-[18px]`}
          >
            {feature.icon}
          </span>
          <div className="pt-0.5">
            <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">{feature.title}</p>
            <p className="mt-0.5 max-w-[220px] text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
              {feature.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The two-column auth layout: a marketing panel that only appears from `lg` up,
 * and the form column. Below `lg` the panel drops away and the form column
 * carries a centred logo, matching the mobile screens in the design.
 */
export function AuthShell({
  heading,
  subheading,
  features,
  illustration,
  formHeading,
  formSubheading,
  mobileIntro,
  backHref,
  children,
}: {
  heading: ReactNode;
  subheading: string;
  features: Feature[];
  illustration: ReactNode;
  formHeading: string;
  formSubheading: string;
  mobileIntro?: ReactNode;
  backHref?: string;
  children: ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row dark:bg-slate-950">
      {/* Marketing panel */}
      <aside className="relative hidden shrink-0 flex-col justify-between overflow-hidden bg-slate-50 px-12 py-10 lg:flex lg:w-[46%] lg:max-w-[620px] dark:bg-slate-900">
        <PanelDecor />

        <div className="relative">
          <BrandLogo tagline size="lg" />
        </div>

        <div className="relative my-8">
          <h2 className="max-w-[320px] text-[34px] font-bold leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            {heading}
          </h2>
          <p className="mt-3 max-w-[280px] text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">
            {subheading}
          </p>
          <div className="mt-6 mb-8 max-w-[340px]">{illustration}</div>
          <FeatureList features={features} />
        </div>

        <p className="relative text-[12px] text-slate-400 dark:text-slate-500">
          © {year} EduPilot. All rights reserved.
        </p>
      </aside>

      {/* Form column */}
      <main className="relative flex flex-1 flex-col px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 lg:hidden" aria-hidden="true">
          <svg className="w-full text-blue-50 dark:text-blue-500/5" viewBox="0 0 600 90" preserveAspectRatio="none">
            <path d="M0 44c96-32 192-32 300-6s204 26 300-6v58H0V44Z" fill="currentColor" />
          </svg>
        </div>

        {/* Mobile header: back affordance and the mark, as in the design */}
        <div className="relative flex items-center justify-center lg:hidden">
          {backHref && (
            <Link
              href={backHref}
              aria-label="Go back"
              className="absolute left-0 -ml-1.5 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-slate-800"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Link>
          )}
          <Link href="/" aria-label="EduPilot home" className="inline-flex items-center gap-2">
            <BrandMark className="h-7 w-7" />
            <span className="text-[16px] font-bold tracking-tight text-[#152a63] dark:text-white">
              Edu<span className="text-blue-600 dark:text-blue-400">Pilot</span>
            </span>
          </Link>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-8 lg:py-0">
          <div className="w-full max-w-[380px]">
            {mobileIntro && <div className="lg:hidden">{mobileIntro}</div>}
            <div className={mobileIntro ? "hidden lg:block" : undefined}>
              <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white">
                {formHeading}
              </h1>
              <p className="mt-1.5 text-[14px] text-slate-500 dark:text-slate-400">{formSubheading}</p>
            </div>

            <div className="mt-7">{children}</div>
          </div>
        </div>

        <p className="relative text-center text-[11.5px] text-slate-400 lg:hidden dark:text-slate-500">
          © {year} EduPilot. All rights reserved.
        </p>
      </main>
    </div>
  );
}
