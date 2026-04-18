import { useRef, useCallback } from "react";

interface UseTypeToSelectOptions {
  labels: string[];
  onMatch: (index: number) => void;
  resetDelay?: number;
}

export const useTypeToSelect = ({ labels, onMatch, resetDelay = 500 }: UseTypeToSelectOptions) => {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastMatchRef = useRef(-1);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1 || e.key === " ") return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      clearTimeout(timerRef.current);
      bufferRef.current += e.key.toLowerCase();
      const buffer = bufferRef.current;

      let matchIndex = -1;
      const allSame = buffer.length > 1 && buffer.split("").every((c) => c === buffer[0]);

      if (allSame) {
        // Same letter repeated — cycle through matches starting with that char
        const char = buffer[0];
        const startFrom = lastMatchRef.current + 1;
        for (let i = 0; i < labels.length; i++) {
          const idx = (startFrom + i) % labels.length;
          if (labels[idx].toLowerCase().startsWith(char)) {
            matchIndex = idx;
            break;
          }
        }
      } else {
        // Prefix search
        matchIndex = labels.findIndex((label) => label.toLowerCase().startsWith(buffer));
      }

      if (matchIndex !== -1) {
        lastMatchRef.current = matchIndex;
        onMatch(matchIndex);
      }

      timerRef.current = setTimeout(() => {
        bufferRef.current = "";
      }, resetDelay);
    },
    [labels, onMatch, resetDelay],
  );

  return { onKeyDown };
};
