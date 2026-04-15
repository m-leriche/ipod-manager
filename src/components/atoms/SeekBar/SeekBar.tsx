import { useRef, useCallback } from "react";

interface SeekBarProps {
  value: number; // 0-1
  onChange: (value: number) => void;
  className?: string;
}

export const SeekBar = ({ value, onChange, className = "" }: SeekBarProps) => {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const calcFraction = useCallback((clientX: number): number => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      draggingRef.current = true;
      onChange(calcFraction(e.clientX));

      const handleMove = (ev: MouseEvent) => {
        if (draggingRef.current) onChange(calcFraction(ev.clientX));
      };
      const handleUp = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [onChange, calcFraction],
  );

  const pct = `${(value * 100).toFixed(1)}%`;

  return (
    <div
      ref={barRef}
      onMouseDown={handleMouseDown}
      className={`group relative h-3 flex items-center cursor-pointer ${className}`}
    >
      <div className="w-full h-[3px] group-hover:h-[5px] rounded-full bg-bg-card transition-all relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-text-primary rounded-full" style={{ width: pct }} />
      </div>
      <div
        className="absolute w-3 h-3 rounded-full bg-text-primary opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2"
        style={{ left: pct }}
      />
    </div>
  );
};
