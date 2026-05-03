import { useState, useRef, useEffect, useCallback } from "react";

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

interface SpeedControlProps {
  speed: number;
  onChange: (speed: number) => void;
}

export const SpeedControl = ({ speed, onChange }: SpeedControlProps) => {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      popoverRef.current &&
      !popoverRef.current.contains(e.target as Node) &&
      buttonRef.current &&
      !buttonRef.current.contains(e.target as Node)
    ) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const isDefault = Math.abs(speed - 1.0) < 0.01;
  const label = speed === 1.0 ? "1x" : `${speed}x`;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums transition-colors ${
          isDefault ? "text-text-tertiary hover:text-text-secondary" : "text-accent bg-accent/10"
        }`}
        title="Playback speed"
      >
        {label}
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 mb-2 bg-bg-card border border-border rounded-lg shadow-lg p-1.5 min-w-[80px] z-50"
        >
          <div className="text-[9px] text-text-tertiary font-medium uppercase tracking-wide px-2 pb-1">Speed</div>
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => {
                onChange(preset);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1 rounded text-[11px] tabular-nums transition-colors ${
                Math.abs(speed - preset) < 0.01
                  ? "text-accent bg-accent/10 font-medium"
                  : "text-text-secondary hover:bg-bg-secondary"
              }`}
            >
              {preset}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
