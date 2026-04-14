import { createContext, useContext, useState, useCallback, useRef } from "react";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";

interface ProgressState {
  active: boolean;
  title: string;
  completed: number;
  total: number;
  currentItem: string;
  canCancel: boolean;
  result: { message: string; success: boolean } | null;
}

interface ProgressContextValue {
  state: ProgressState;
  start: (title: string, cancelFn?: () => void) => void;
  update: (completed: number, total: number, currentItem?: string) => void;
  finish: (message: string) => void;
  fail: (message: string) => void;
  dismiss: () => void;
  cancel: () => void;
}

const initial: ProgressState = {
  active: false,
  title: "",
  completed: 0,
  total: 0,
  currentItem: "",
  canCancel: false,
  result: null,
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

export const ProgressProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<ProgressState>(initial);
  const cancelRef = useRef<(() => void) | null>(null);

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
      cancelRef.current = cancelFn ?? null;
      setState({
        active: true,
        title,
        completed: 0,
        total: 0,
        currentItem: "",
        canCancel: !!cancelFn,
        result: null,
      });
      setDockIndicator(-1);
    },
    [setDockIndicator],
  );

  const update = useCallback(
    (completed: number, total: number, currentItem?: string) => {
      setState((prev) => ({
        ...prev,
        completed,
        total,
        currentItem: currentItem ?? prev.currentItem,
      }));
      if (total > 0) {
        setDockIndicator(Math.round((completed / total) * 100));
      }
    },
    [setDockIndicator],
  );

  const finish = useCallback(
    (message: string) => {
      cancelRef.current = null;
      setState((prev) => ({
        ...prev,
        canCancel: false,
        result: { message, success: true },
      }));
      setDockIndicator();
    },
    [setDockIndicator],
  );

  const fail = useCallback(
    (message: string) => {
      cancelRef.current = null;
      setState((prev) => ({
        ...prev,
        canCancel: false,
        result: { message, success: false },
      }));
      setDockIndicator();
    },
    [setDockIndicator],
  );

  const dismiss = useCallback(() => {
    cancelRef.current = null;
    setState(initial);
    setDockIndicator();
  }, [setDockIndicator]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  return (
    <ProgressContext.Provider value={{ state, start, update, finish, fail, dismiss, cancel }}>
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = (): ProgressContextValue => {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
};
