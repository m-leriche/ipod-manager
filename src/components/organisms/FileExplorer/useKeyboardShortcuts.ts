import { useEffect, type RefObject } from "react";

interface Handlers {
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onRename: () => void;
  onNewFolder: () => void;
  onEnter: () => void;
}

export const useKeyboardShortcuts = (containerRef: RefObject<HTMLDivElement | null>, handlers: Handlers) => {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== containerRef.current) {
        return;
      }

      // Don't intercept when typing in an input
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      const cmd = e.metaKey || e.ctrlKey;

      if (cmd && e.key === "c") {
        e.preventDefault();
        handlers.onCopy();
      } else if (cmd && e.key === "x") {
        e.preventDefault();
        handlers.onCut();
      } else if (cmd && e.key === "v") {
        e.preventDefault();
        handlers.onPaste();
      } else if (cmd && e.key === "a") {
        e.preventDefault();
        handlers.onSelectAll();
      } else if (cmd && e.shiftKey && e.key === "N") {
        e.preventDefault();
        handlers.onNewFolder();
      } else if (e.key === "F2") {
        e.preventDefault();
        handlers.onRename();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handlers.onDelete();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handlers.onEnter();
      }
    };

    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [containerRef, handlers]);
};
