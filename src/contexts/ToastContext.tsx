import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ToastActions {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
  warning: (message: string, action?: ToastAction) => void;
  dismiss: (id: string) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
}

interface ToastState {
  toasts: Toast[];
}

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

// Separate contexts: actions (stable) vs state (changes on every toast add/remove).
// Components that only fire toasts subscribe to actions and never re-render from toast state changes.
const ToastActionsContext = createContext<ToastActions | null>(null);
const ToastStateContext = createContext<ToastState | null>(null);

let nextId = 0;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track when each toast was last started/resumed so we can compute remaining time on pause
  const startedAtRef = useRef<Map<string, { at: number; remaining: number }>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    startedAtRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pauseTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    const info = startedAtRef.current.get(id);
    if (!timer || !info) return;
    clearTimeout(timer);
    timersRef.current.delete(id);
    const elapsed = Date.now() - info.at;
    startedAtRef.current.set(id, { at: 0, remaining: Math.max(info.remaining - elapsed, 500) });
  }, []);

  const resumeTimer = useCallback((id: string) => {
    const info = startedAtRef.current.get(id);
    if (!info || timersRef.current.has(id)) return;
    const remaining = info.remaining;
    startedAtRef.current.set(id, { at: Date.now(), remaining });
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      startedAtRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, remaining);
    timersRef.current.set(id, timer);
  }, []);

  const addToast = useCallback((type: ToastType, message: string, action?: ToastAction) => {
    const id = `toast-${++nextId}`;
    const toast: Toast = { id, type, message, action };
    // Give toasts with action buttons extra time so users can click them
    const duration = action ? Math.max(DURATIONS[type], 8000) : DURATIONS[type];

    setToasts((prev) => [...prev, toast]);

    startedAtRef.current.set(id, { at: Date.now(), remaining: duration });
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      startedAtRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);

    timersRef.current.set(id, timer);
  }, []);

  const success = useCallback(
    (message: string, action?: ToastAction) => addToast("success", message, action),
    [addToast],
  );
  const error = useCallback((message: string, action?: ToastAction) => addToast("error", message, action), [addToast]);
  const info = useCallback((message: string, action?: ToastAction) => addToast("info", message, action), [addToast]);
  const warning = useCallback(
    (message: string, action?: ToastAction) => addToast("warning", message, action),
    [addToast],
  );

  const actions = useMemo(
    () => ({ success, error, info, warning, dismiss, pauseTimer, resumeTimer }),
    [success, error, info, warning, dismiss, pauseTimer, resumeTimer],
  );
  const state = useMemo(() => ({ toasts }), [toasts]);

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastStateContext.Provider value={state}>{children}</ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  );
};

/** Returns stable toast action methods. Does NOT re-render when toasts change. */
export const useToast = (): ToastActions => {
  const ctx = useContext(ToastActionsContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};

/** Returns the current toasts array. Only use in components that render toasts. */
export const useToastState = (): Toast[] => {
  const ctx = useContext(ToastStateContext);
  if (!ctx) throw new Error("useToastState must be used within ToastProvider");
  return ctx.toasts;
};
