import { createContext, useContext, useState, useCallback, useRef } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  dismiss: (id: string) => void;
}

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `toast-${++nextId}`;
    const toast: Toast = { id, type, message };

    setToasts((prev) => [...prev, toast]);

    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATIONS[type]);

    timersRef.current.set(id, timer);
  }, []);

  const success = useCallback((message: string) => addToast("success", message), [addToast]);
  const error = useCallback((message: string) => addToast("error", message), [addToast]);
  const info = useCallback((message: string) => addToast("info", message), [addToast]);
  const warning = useCallback((message: string) => addToast("warning", message), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, success, error, info, warning, dismiss }}>{children}</ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};
