import { useState } from "react";
import { useToast, useToastState } from "../../../contexts/ToastContext";
import type { Toast as ToastData, ToastType } from "../../../contexts/ToastContext";

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  ),
};

const STYLES: Record<ToastType, string> = {
  success: "border-success/30 text-success",
  error: "border-danger/30 text-danger",
  warning: "border-warning/30 text-warning",
  info: "border-accent/30 text-accent",
};

const ToastItem = ({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) => {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 150);
  };

  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border bg-bg-card shadow-lg backdrop-blur-sm max-w-sm transition-all duration-150 ${STYLES[toast.type]} ${
        exiting ? "opacity-0 translate-x-4" : "animate-[toast-in_200ms_ease-out]"
      }`}
    >
      <span className="shrink-0 mt-0.5">{ICONS[toast.type]}</span>
      <p className="flex-1 text-[11px] leading-relaxed text-text-primary break-words">{toast.message}</p>
      <button
        onClick={handleDismiss}
        className="shrink-0 mt-0.5 text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export const ToastContainer = () => {
  const toasts = useToastState();
  const { dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-16 right-4 z-[100] flex flex-col gap-2 pointer-events-auto">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
};
