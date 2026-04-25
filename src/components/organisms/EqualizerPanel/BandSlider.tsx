import { useRef, useCallback, useState } from "react";
import { GAIN_MIN, GAIN_MAX } from "./constants";

interface BandSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  narrow?: boolean;
}

const SLIDER_HEIGHT = 120;

export const BandSlider = ({ label, value, onChange, disabled, narrow }: BandSliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const calcGain = useCallback((clientY: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    // Top = max gain, bottom = min gain
    const fraction = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return GAIN_MIN + fraction * (GAIN_MAX - GAIN_MIN);
  }, []);

  const snap = (v: number): number => Math.round(v * 2) / 2; // Snap to 0.5dB

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragging(true);
      onChange(snap(calcGain(e.clientY)));

      const handleMove = (ev: MouseEvent) => {
        onChange(snap(calcGain(ev.clientY)));
      };
      const handleUp = () => {
        setDragging(false);
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [disabled, onChange, calcGain],
  );

  const handleDoubleClick = useCallback(() => {
    if (!disabled) onChange(0);
  }, [disabled, onChange]);

  // Position: 0dB is center, map gain to pixel offset from center
  const fraction = (value - GAIN_MIN) / (GAIN_MAX - GAIN_MIN);
  const thumbTop = (1 - fraction) * SLIDER_HEIGHT;
  const centerY = SLIDER_HEIGHT / 2;
  const fillTop = Math.min(thumbTop, centerY);
  const fillHeight = Math.abs(thumbTop - centerY);

  return (
    <div
      className={`flex flex-col items-center gap-1 ${narrow ? "min-w-[16px]" : "min-w-[28px]"} ${disabled ? "opacity-40" : ""}`}
    >
      {/* dB value — fixed width so negative sign doesn't shift layout */}
      <span
        className={`text-[9px] tabular-nums h-3 leading-3 text-center overflow-hidden ${narrow ? "w-[30px]" : "w-[36px]"} ${dragging ? "text-text-primary" : "text-text-tertiary"}`}
      >
        {value > 0 ? "+" : ""}
        {value.toFixed(1)}
      </span>

      {/* Vertical track */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="relative cursor-pointer group"
        style={{ width: narrow ? 10 : 16, height: SLIDER_HEIGHT }}
      >
        {/* Track background */}
        <div className="absolute inset-x-0 top-0 bottom-0 flex justify-center">
          <div className="w-[3px] h-full bg-bg-card rounded-full" />
        </div>

        {/* Center line (0dB) */}
        <div className="absolute left-0 right-0 h-px bg-text-tertiary/30" style={{ top: centerY }} />

        {/* Fill from center */}
        <div className="absolute inset-x-0 flex justify-center" style={{ top: fillTop, height: fillHeight }}>
          <div className={`w-[3px] rounded-full ${value === 0 ? "bg-transparent" : "bg-accent"}`} />
        </div>

        {/* Thumb */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform ${
            dragging ? "scale-125 bg-accent" : "bg-text-secondary group-hover:bg-text-primary"
          }`}
          style={{
            top: thumbTop,
            width: narrow ? 8 : 10,
            height: narrow ? 8 : 10,
          }}
        />
      </div>

      {/* Frequency label */}
      <span className={`text-[8px] text-text-tertiary leading-none ${narrow ? "rotate-[-45deg] translate-y-1" : ""}`}>
        {label}
      </span>
    </div>
  );
};
