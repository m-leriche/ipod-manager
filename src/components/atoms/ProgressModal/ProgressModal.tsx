import { useProgress } from "../../../contexts/ProgressContext";

export const ProgressModal = () => {
  const { state, cancel, dismiss } = useProgress();

  if (!state.active) return null;

  const pct = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;
  const hasResult = state.result !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[400px] max-w-[90vw] p-6">
        <div className="text-sm font-medium text-text-primary mb-4">{state.title}</div>

        {!hasResult && (
          <>
            {/* Progress bar */}
            <div className="w-full h-2 bg-bg-card rounded-full overflow-hidden mb-3">
              {state.total > 0 ? (
                <div
                  className="h-full bg-accent rounded-full transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-full bg-accent rounded-full animate-pulse w-full opacity-30" />
              )}
            </div>

            {/* Details */}
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-text-tertiary truncate max-w-[70%]">{state.currentItem}</span>
              {state.total > 0 && (
                <span className="text-[11px] text-text-secondary font-medium shrink-0">
                  {state.completed} / {state.total}
                </span>
              )}
            </div>

            {/* Cancel button */}
            {state.canCancel && (
              <div className="flex justify-end mt-4">
                <button
                  onClick={cancel}
                  className="px-4 py-2 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:text-text-primary hover:border-border-active transition-all"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

        {hasResult && (
          <>
            <div
              className={`px-3 py-2.5 rounded-xl text-xs leading-relaxed mb-4 ${
                state.result!.success ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
              }`}
            >
              {state.result!.message}
            </div>
            <div className="flex justify-end">
              <button
                onClick={dismiss}
                className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium hover:opacity-90 transition-all"
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
