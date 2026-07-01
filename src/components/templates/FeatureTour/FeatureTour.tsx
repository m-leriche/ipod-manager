import { useEffect, useState } from "react";
import { setSetting } from "../../../utils/settings";
import { TOUR_STEPS } from "./constants";

interface FeatureTourProps {
  onClose: () => void;
}

export const FeatureTour = ({ onClose }: FeatureTourProps) => {
  const [step, setStep] = useState(0);
  const isLast = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];

  const finish = () => {
    setSetting("tourCompleted", true);
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={finish} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[420px] max-w-[90vw] flex flex-col"
      >
        <div className="px-6 pt-6 pb-5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-2">
            Step {step + 1} of {TOUR_STEPS.length}
          </p>
          <h2 id="tour-title" className="text-base font-semibold text-text-primary mb-2">
            {current.title}
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">{current.body}</p>
        </div>

        <div className="flex items-center justify-between px-6 pb-5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.title}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-accent" : "bg-border"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Back
              </button>
            )}
            {!isLast && (
              <button
                onClick={finish}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="px-4 py-1.5 rounded-md text-xs font-medium bg-accent text-bg-primary hover:opacity-90 transition-opacity"
            >
              {isLast ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
