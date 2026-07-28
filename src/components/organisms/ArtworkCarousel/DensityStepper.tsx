import { COVER_FLOW_SIDE_COUNTS } from "../../../utils/settings";
import type { DensityStepperProps } from "./types";

/** Steps the number of visible covers (center + `sideCount` per side). */
export const DensityStepper = ({ sideCount, onChange }: DensityStepperProps) => (
  <div
    role="group"
    aria-label="Cover flow density"
    className="flex items-center gap-0.5 bg-white/5 backdrop-blur-sm rounded-md p-0.5"
  >
    <StepButton
      label="−"
      title="Fewer covers"
      disabled={sideCount <= COVER_FLOW_SIDE_COUNTS.min}
      onClick={() => onChange(sideCount - 1)}
    />
    {/* role=status so stepping announces the new count */}
    <span role="status" aria-label="Visible covers" className="px-1 text-[10px] font-medium text-white/55 tabular-nums">
      {sideCount * 2 + 1}
    </span>
    <StepButton
      label="+"
      title="More covers"
      disabled={sideCount >= COVER_FLOW_SIDE_COUNTS.max}
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
