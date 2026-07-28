import { MIN_SIDE_COUNT, MAX_SIDE_COUNT } from "./helpers";
import type { DensityStepperProps } from "./types";

/** Steps the number of visible covers (center + `sideCount` per side). */
export const DensityStepper = ({ sideCount, onChange }: DensityStepperProps) => (
  <div className="flex items-center gap-0.5 bg-white/5 backdrop-blur-sm rounded-md p-0.5">
    <StepButton
      label="−"
      title="Fewer covers"
      disabled={sideCount <= MIN_SIDE_COUNT}
      onClick={() => onChange(sideCount - 1)}
    />
    <span className="px-1 text-[10px] font-medium text-white/55 tabular-nums" aria-label="Visible covers">
      {sideCount * 2 + 1}
    </span>
    <StepButton
      label="+"
      title="More covers"
      disabled={sideCount >= MAX_SIDE_COUNT}
      onClick={() => onChange(sideCount + 1)}
    />
  </div>
);

const StepButton = ({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className="px-1.5 py-1 rounded-md text-[11px] leading-none font-medium text-white/35 transition-colors hover:text-white/70 disabled:text-white/15 disabled:hover:text-white/15"
  >
    {label}
  </button>
);
