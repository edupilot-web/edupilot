import { CheckIcon } from "@/components/icons";

export const ONBOARDING_STEPS = [
  { key: "education", label: "Education" },
  { key: "academic", label: "Academic" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

/** Progress rail above the onboarding card: done, current, upcoming. */
export function Stepper({ current }: { current: OnboardingStepKey }) {
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="flex items-center justify-center gap-2" aria-label="Onboarding progress">
      {ONBOARDING_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold transition ${
                active
                  ? "bg-blue-600 text-white"
                  : done
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold ${
                  active
                    ? "bg-white/20 text-white"
                    : done
                      ? "bg-emerald-500 text-white"
                      : "bg-white text-slate-400 dark:bg-slate-700 dark:text-slate-400"
                }`}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {step.label}
            </span>

            {index < ONBOARDING_STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`h-px w-6 sm:w-10 ${
                  done ? "bg-emerald-300 dark:bg-emerald-500/40" : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
