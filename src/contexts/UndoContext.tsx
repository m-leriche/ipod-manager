import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useToast } from "./ToastContext";

export interface UndoEntry {
  label: string;
  undo: () => Promise<void>;
}

interface UndoActions {
  push: (entry: UndoEntry) => void;
}

const UndoContext = createContext<UndoActions | null>(null);

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/** Global undo stack for file operations, wired to Cmd+Z. */
export const UndoProvider = ({ children }: { children: React.ReactNode }) => {
  const stackRef = useRef<UndoEntry[]>([]);
  const busyRef = useRef(false);
  const toast = useToast();

  const push = useCallback((entry: UndoEntry) => {
    stackRef.current.push(entry);
  }, []);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // e.key, not e.code — undo follows the key labeled Z on any layout
      if (e.key.toLowerCase() !== "z" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (isEditableTarget(e.target) || busyRef.current) return;
      const entry = stackRef.current.pop();
      if (!entry) return;

      e.preventDefault();
      busyRef.current = true;
      try {
        await entry.undo();
        toast.success(`Undone: ${entry.label}`);
      } catch (err) {
        // Keep the entry so a transient failure can be retried
        stackRef.current.push(entry);
        toast.error(`Undo failed: ${err}`);
      } finally {
        busyRef.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toast]);

  const value = useMemo(() => ({ push }), [push]);
  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
};

export const useUndo = (): UndoActions => {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
};
