import { useRef, useCallback } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

type SelectionMode = "single" | "range";

interface UseKeyboardNavigationOptions {
  /** Total number of items in the list */
  count: number;
  /** Called when navigation selects item(s). Receives the new focused index and selection mode. */
  onNavigate: (index: number, mode: SelectionMode) => void;
  /** Called when Enter is pressed on the focused index */
  onActivate?: (index: number) => void;
  /** Called when Escape is pressed */
  onDeselect?: () => void;
  /** Virtualizer instance for scrollToIndex */
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** Minimum valid index. -1 for lists with an "All" button, 0 for normal lists. Default: 0 */
  minIndex?: number;
  /** Current selected index hint — used as starting position when keyboard nav begins */
  selectedIndex?: number;
}

export const useKeyboardNavigation = ({
  count,
  onNavigate,
  onActivate,
  onDeselect,
  virtualizer,
  minIndex = 0,
  selectedIndex = 0,
}: UseKeyboardNavigationOptions) => {
  const focusedIndexRef = useRef(-1);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (count === 0 && e.key !== "Escape") return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Clamp stale index
      if (focusedIndexRef.current >= count) {
        focusedIndexRef.current = count - 1;
      }

      const resolve = () => (focusedIndexRef.current >= minIndex ? focusedIndexRef.current : selectedIndexRef.current);

      const scrollTo = (index: number) => {
        if (index >= 0) {
          virtualizer.scrollToIndex(index, { align: "auto" });
        }
        // index < 0 (e.g. "All" button) — caller handles scroll in onNavigate
      };

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const cur = resolve();
          const next = Math.min(cur + 1, count - 1);
          focusedIndexRef.current = next;
          scrollTo(next);
          onNavigate(next, e.shiftKey ? "range" : "single");
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const cur = resolve();
          const next = Math.max(cur - 1, minIndex);
          focusedIndexRef.current = next;
          scrollTo(next);
          onNavigate(next, e.shiftKey ? "range" : "single");
          break;
        }
        case "Home": {
          e.preventDefault();
          focusedIndexRef.current = minIndex;
          scrollTo(minIndex);
          onNavigate(minIndex, "single");
          break;
        }
        case "End": {
          e.preventDefault();
          const last = count - 1;
          focusedIndexRef.current = last;
          scrollTo(last);
          onNavigate(last, "single");
          break;
        }
        case "Enter": {
          e.preventDefault();
          const cur = resolve();
          if (cur >= minIndex) onActivate?.(cur);
          break;
        }
        case "Escape": {
          e.preventDefault();
          focusedIndexRef.current = minIndex;
          onDeselect?.();
          break;
        }
        default:
          return; // don't prevent default for unhandled keys
      }
    },
    [count, minIndex, onNavigate, onActivate, onDeselect, virtualizer],
  );

  return { onKeyDown, focusedIndexRef };
};
