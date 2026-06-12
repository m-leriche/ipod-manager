import { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { useToast } from "./ToastContext";

interface ProgressState {
  active: boolean;
  title: string;
  completed: number;
  total: number;
  currentItem: string;
  canCancel: boolean;
}

interface ProgressActions {
  start: (title: string, cancelFn?: () => void) => void;
  update: (completed: number, total: number, currentItem?: string) => void;
  finish: (message: string) => void;
  fail: (message: string) => void;
  cancel: () => void;
}

const initial: ProgressState = {
  active: false,
  title: "",
  completed: 0,
  total: 0,
  currentItem: "",
  canCancel: false,
};

// State and actions live in separate contexts so the many components that
// only trigger progress (stable actions) don't re-render on every progress
// tick — only display components subscribed via useProgressState do.
const ProgressStateContext = createContext<ProgressState | null>(null);
const ProgressActionsContext = createContext<ProgressActions | null>(null);

export const ProgressProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<ProgressState>(initial);
  const cancelRef = useRef<(() => void) | null>(null);
  const lastDockPercentRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const toast = useToast();

  const win = getCurrentWindow();

  const setDockIndicator = useCallback(
    (percent?: number) => {
      if (percent === undefined) {
        win.setProgressBar({ status: ProgressBarStatus.None }).catch(() => {});
        win.setBadgeLabel().catch(() => {});
      } else if (percent < 0) {
        win.setProgressBar({ status: ProgressBarStatus.Indeterminate }).catch(() => {});
        win.setBadgeLabel("...").catch(() => {});
      } else {
        win.setProgressBar({ status: ProgressBarStatus.Normal, progress: percent }).catch(() => {});
        win.setBadgeLabel(`${percent}%`).catch(() => {});
      }
    },
    [win],
  );

  const start = useCallback(
    (title: string, cancelFn?: () => void) => {
      generationRef.current++;
      lastDockPercentRef.current = null;
      cancelRef.current = cancelFn ?? null;
      setState({
        active: true,
        title,
        completed: 0,
        total: 0,
        currentItem: "",
        canCancel: !!cancelFn,
      });
      setDockIndicator(-1);
    },
    [setDockIndicator],
  );

  const update = useCallback(
    (completed: number, total: number, currentItem?: string) => {
      const gen = generationRef.current;
      setState((prev) => ({
        ...prev,
        completed,
        total,
        currentItem: currentItem ?? prev.currentItem,
      }));
      if (total > 0 && gen === generationRef.current) {
        const pct = Math.round((completed / total) * 100);
        if (pct !== lastDockPercentRef.current) {
          lastDockPercentRef.current = pct;
          setDockIndicator(pct);
        }
      }
    },
    [setDockIndicator],
  );

  const finish = useCallback(
    (message: string) => {
      generationRef.current++;
      cancelRef.current = null;
      lastDockPercentRef.current = null;
      setState(initial);
      setDockIndicator();
      toast.success(message);
    },
    [setDockIndicator, toast],
  );

  const fail = useCallback(
    (message: string) => {
      generationRef.current++;
      cancelRef.current = null;
      lastDockPercentRef.current = null;
      setState(initial);
      setDockIndicator();
      toast.error(message);
    },
    [setDockIndicator, toast],
  );

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  const actions = useMemo(() => ({ start, update, finish, fail, cancel }), [start, update, finish, fail, cancel]);

  return (
    <ProgressActionsContext.Provider value={actions}>
      <ProgressStateContext.Provider value={state}>{children}</ProgressStateContext.Provider>
    </ProgressActionsContext.Provider>
  );
};

/** Progress actions. Stable — consumers don't re-render on progress ticks. */
export const useProgress = (): ProgressActions => {
  const ctx = useContext(ProgressActionsContext);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
};

/** Live progress state. Re-renders on every tick — for display components only. */
export const useProgressState = (): ProgressState => {
  const ctx = useContext(ProgressStateContext);
  if (!ctx) throw new Error("useProgressState must be used within ProgressProvider");
  return ctx;
};
