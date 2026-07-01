interface HealthSummaryProps {
  totalTracks: number;
  attentionCount: number;
  onRefresh: () => void;
}

export const HealthSummary = ({ totalTracks, attentionCount, onRefresh }: HealthSummaryProps) => {
  const healthy = attentionCount === 0;

  return (
    <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-4 flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
          healthy ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
        }`}
      >
        {healthy ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        )}
      </div>

      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-text-primary">
          {healthy
            ? "Your library is healthy"
            : `${attentionCount} ${attentionCount === 1 ? "issue needs" : "issues need"} attention`}
        </h2>
        <p className="text-xs text-text-tertiary mt-0.5">
          {healthy
            ? `No metadata or quality issues across ${totalTracks.toLocaleString()} tracks.`
            : `Across ${totalTracks.toLocaleString()} tracks in your library.`}
        </p>
      </div>

      <button
        onClick={onRefresh}
        className="ml-auto shrink-0 px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary hover:border-border-active transition-all"
      >
        Refresh
      </button>
    </div>
  );
};
