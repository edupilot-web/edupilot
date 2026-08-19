import Link from "next/link";
import { GraduationCapIcon } from "@/components/icons";
import { HeroIllustration } from "@/components/hero-illustration";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#eaf1fe] via-[#f2f7ff] to-[#fbfcff] dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 pb-28 pt-14 lg:grid-cols-[1fr_minmax(0,560px)] lg:gap-6 lg:px-10 lg:pb-40 lg:pt-20">
        {/* Copy */}
        <div className="lg:pl-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-[13px] font-semibold text-blue-600 ring-1 ring-blue-600/10 backdrop-blur dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20">
            <GraduationCapIcon className="h-4 w-4" />
            Empowering Graduate Students
          </span>

          <h1 className="mt-6 text-[34px] font-bold leading-[1.15] tracking-tight text-[#101a37] sm:text-[42px] lg:text-[52px] dark:text-white">
            Learn. Connect. Grow.
            <br />
            Achieve your research and career goals.
          </h1>

          <p className="mt-6 max-w-[34rem] text-[16px] leading-relaxed text-slate-500 lg:text-[17px] dark:text-slate-400">
            A one-stop platform for graduate students to discover opportunities,
            connect with peers and mentors, and accelerate your journey.
          </p>

          {/* Not in the mockup, but a hero without a call to action strands the
              visitor — both targets already exist. */}
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-blue-600 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
            >
              Get started free
            </Link>
            <Link
              href="/explore"
              className="rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
            >
              Explore courses
            </Link>
          </div>
        </div>

        {/* Illustration */}
        <HeroIllustration className="mx-auto w-full max-w-[420px] lg:max-w-none" />
      </div>

      {/* The white wave the hero sits on */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 130"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[70px] w-full text-white lg:h-[110px] dark:text-slate-950"
      >
        <path
          d="M0 130V54c240-52 480-64 720-36s480 40 720-18v130Z"
          fill="currentColor"
        />
      </svg>
    </section>
  );
}
