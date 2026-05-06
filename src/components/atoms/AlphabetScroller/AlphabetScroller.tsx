import { useRef, useCallback } from "react";
import { ALPHABET } from "./helpers";
import type { AlphabetScrollerProps } from "./types";

export const AlphabetScroller = ({
  letterMap,
  activeLetter,
  onLetterSelect,
  variant = "default",
}: AlphabetScrollerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const selectLetterAtY = useCallback(
    (clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = clientY - rect.top;
      const index = Math.min(ALPHABET.length - 1, Math.max(0, Math.floor((y / rect.height) * ALPHABET.length)));
      const letter = ALPHABET[index];
      const albumIndex = letterMap.get(letter);
      if (albumIndex !== undefined) {
        onLetterSelect(letter, albumIndex);
      }
    },
    [letterMap, onLetterSelect],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      selectLetterAtY(e.clientY);

      const handleMouseMove = (ev: MouseEvent) => {
        if (isDraggingRef.current) selectLetterAtY(ev.clientY);
      };
      const handleMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [selectLetterAtY],
  );

  const isDark = variant === "dark";

  return (
    <div
      ref={containerRef}
      className="flex flex-col justify-between gap-px py-1 pr-1.5 select-none cursor-pointer"
      onMouseDown={handleMouseDown}
      role="navigation"
      aria-label="Alphabet scroller"
    >
      {ALPHABET.map((letter) => {
        const available = letterMap.has(letter);
        const isActive = activeLetter === letter;

        return (
          <div
            key={letter}
            className={`
              flex items-center justify-center text-[11px] font-semibold leading-none transition-colors
              ${
                isActive
                  ? isDark
                    ? "text-white"
                    : "text-accent"
                  : available
                    ? isDark
                      ? "text-white/50 hover:text-white/80"
                      : "text-text-secondary hover:text-text-primary"
                    : isDark
                      ? "text-white/15"
                      : "text-text-tertiary/30"
              }
            `}
            style={{ width: 16, height: "calc(100% / 27)" }}
          >
            {letter}
          </div>
        );
      })}
    </div>
  );
};
