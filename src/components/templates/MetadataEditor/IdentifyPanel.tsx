import type { IdentifyResult, AcoustIdMatch } from "./types";

interface IdentifyPanelProps {
  results: IdentifyResult[];
  selectedFile: string | null;
  onSelectFile: (filePath: string) => void;
  selectedResult: IdentifyResult | null;
  choices: Record<string, AcoustIdMatch>;
  onSelectMatch: (filePath: string, match: AcoustIdMatch) => void;
  onClearMatch: (filePath: string) => void;
}

export const IdentifyPanel = ({
  results,
  selectedFile,
  onSelectFile,
  selectedResult,
  choices,
  onSelectMatch,
  onClearMatch,
}: IdentifyPanelProps) => (
  <>
    {/* Track list */}
    <div className="w-72 shrink-0 bg-bg-secondary border border-border rounded-2xl flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
          Tracks ({results.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {results.map((r) => (
          <TrackItem
            key={r.file_path}
            result={r}
            selected={selectedFile === r.file_path}
            hasChoice={r.file_path in choices}
            onClick={() => onSelectFile(r.file_path)}
          />
        ))}
      </div>
    </div>

    {/* Detail panel */}
    {selectedResult ? (
      <div className="flex-1 bg-bg-secondary border border-border rounded-2xl flex flex-col min-h-0 overflow-y-auto">
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="text-xs font-medium text-text-primary truncate">{selectedResult.file_name}</div>
          <div className="text-[10px] text-text-tertiary truncate mt-0.5">{selectedResult.file_path}</div>
        </div>

        {selectedResult.error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-danger/10 text-danger text-[11px]">
            {selectedResult.error}
          </div>
        )}

        {selectedResult.matches.length === 0 && !selectedResult.error && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-text-tertiary text-xs">No matches found</span>
          </div>
        )}

        {selectedResult.matches.length > 0 && (
          <div className="p-4 flex flex-col gap-2">
            <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest mb-1">
              Matches ({selectedResult.matches.length})
            </div>
            {selectedResult.matches.map((match) => (
              <MatchCard
                key={match.recording_id}
                match={match}
                isChosen={choices[selectedResult.file_path]?.recording_id === match.recording_id}
                onSelect={() => onSelectMatch(selectedResult.file_path, match)}
                onClear={() => onClearMatch(selectedResult.file_path)}
              />
            ))}
          </div>
        )}
      </div>
    ) : (
      <div className="flex-1 flex items-center justify-center bg-bg-secondary border border-border rounded-2xl">
        <span className="text-text-tertiary text-xs">Select a track to see matches</span>
      </div>
    )}
  </>
);

// ── Sub-components ──────────────────────────────────────────────

const TrackItem = ({
  result,
  selected,
  hasChoice,
  onClick,
}: {
  result: IdentifyResult;
  selected: boolean;
  hasChoice: boolean;
  onClick: () => void;
}) => {
  const status = hasChoice ? "chosen" : result.error ? "error" : result.matches.length > 0 ? "matched" : "none";

  const statusColor = {
    chosen: "text-success",
    matched: "text-warning",
    error: "text-danger",
    none: "text-text-tertiary",
  }[status];

  const statusDot = {
    chosen: "bg-success",
    matched: "bg-warning",
    error: "bg-danger",
    none: "bg-text-tertiary/30",
  }[status];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
        selected
          ? "bg-bg-card border border-border-active text-text-primary"
          : "text-text-secondary hover:bg-bg-card/50"
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
      <span className="truncate flex-1">{result.file_name}</span>
      <span className={`text-[10px] shrink-0 ${statusColor}`}>
        {status === "chosen" && "✓"}
        {status === "matched" && `${result.matches.length}`}
        {status === "error" && "!"}
        {status === "none" && "—"}
      </span>
    </button>
  );
};

const MatchCard = ({
  match,
  isChosen,
  onSelect,
  onClear,
}: {
  match: AcoustIdMatch;
  isChosen: boolean;
  onSelect: () => void;
  onClear: () => void;
}) => (
  <button
    onClick={isChosen ? onClear : onSelect}
    className={`w-full text-left p-3 rounded-xl border transition-all ${
      isChosen
        ? "bg-accent/10 border-accent text-text-primary"
        : "bg-bg-card border-border hover:border-border-active text-text-secondary"
    }`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{match.title ?? "Unknown Title"}</div>
        <div className="text-[11px] text-text-tertiary truncate mt-0.5">{match.artist ?? "Unknown Artist"}</div>
        {match.album && (
          <div className="text-[10px] text-text-tertiary truncate mt-0.5">
            {match.album}
            {match.date && ` (${match.date.slice(0, 4)})`}
            {match.track_number != null && ` · Track ${match.track_number}`}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`text-[10px] font-medium ${match.score >= 0.9 ? "text-success" : match.score >= 0.7 ? "text-warning" : "text-text-tertiary"}`}
        >
          {Math.round(match.score * 100)}%
        </span>
        <span
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
            isChosen ? "border-accent bg-accent" : "border-border"
          }`}
        >
          {isChosen && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
        </span>
      </div>
    </div>
  </button>
);
