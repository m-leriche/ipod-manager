import { createContext, useContext, useState, useCallback, useRef } from "react";

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

  const start = useCallback((title: string, cancelFn?: () => void) => {
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
  }, []);

  const update = useCallback((completed: number, total: number, currentItem?: string) => {
    setState((prev) => ({
      ...prev,
      completed,
      total,
      currentItem: currentItem ?? prev.currentItem,
    }));
  }, []);

  const finish = useCallback((message: string) => {
    cancelRef.current = null;
    setState((prev) => ({
      ...prev,
      canCancel: false,
      result: { message, success: true },
    }));
  }, []);

  const fail = useCallback((message: string) => {
    cancelRef.current = null;
    setState((prev) => ({
      ...prev,
      canCancel: false,
      result: { message, success: false },
    }));
  }, []);

  const dismiss = useCallback(() => {
    cancelRef.current = null;
    setState(initial);
  }, []);

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
