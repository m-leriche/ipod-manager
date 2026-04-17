import { useRef, useCallback, useState } from "react";

interface SeekBarProps {
  value: number; // 0-1
  onChange: (value: number) => void;
  onScrub?: (fraction: number | null) => void;
  className?: string;
}

export const SeekBar = ({ value, onChange, onScrub, className = "" }: SeekBarProps) => {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const calcFraction = useCallback((clientX: number): number => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const frac = calcFraction(e.clientX);
      setDragFraction(frac);
      onScrub?.(frac);

      const handleMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const f = calcFraction(ev.clientX);
        setDragFraction(f);
        onScrub?.(f);
      };
      const handleUp = (ev: MouseEvent) => {
        if (draggingRef.current) {
          onChange(calcFraction(ev.clientX));
        }
        draggingRef.current = false;
        setDragFraction(null);
        onScrub?.(null);
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [onChange, onScrub, calcFraction],
  );

  const displayFraction = dragFraction ?? value;
  const pct = `${(displayFraction * 100).toFixed(1)}%`;

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
