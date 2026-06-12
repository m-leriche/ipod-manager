import { useState } from "react";
import type { AcceptedGenre, AlbumGenreResult, GenreLookupOutcome } from "./types";

interface GenreLookupModalProps {
  outcome: GenreLookupOutcome;
  onApply: (accepted: AcceptedGenre[]) => void;
  onCancel: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  lastfm_album: "Last.fm",
  lastfm_artist: "Last.fm artist",
  musicbrainz: "MusicBrainz",
};

const albumKey = (r: { artist: string; album: string }): string => `${r.artist}::${r.album}`;

export const GenreLookupModal = ({ outcome, onApply, onCancel }: GenreLookupModalProps) => {
  const withSuggestion = outcome.results.filter((r) => r.suggested_genres !== null);
  const withoutSuggestion = outcome.results.filter((r) => r.suggested_genres === null);
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(withSuggestion.map(albumKey)));
  const [edited, setEdited] = useState<Map<string, string>>(() => new Map());

  const suggestionFor = (r: AlbumGenreResult): string => edited.get(albumKey(r)) ?? r.suggested_genres ?? "";

  const toggleAlbum = (key: string) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const editSuggestion = (key: string, value: string) => {
    setEdited((prev) => new Map(prev).set(key, value));
  };

  const handleApply = () => {
    const selected = withSuggestion
      .filter((r) => accepted.has(albumKey(r)))
      .map((r) => ({ result: r, genre: suggestionFor(r).trim() }))
      .filter((a) => a.genre !== "");
    onApply(selected);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[760px] max-w-[95vw] max-h-[70vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Confirm Genre Suggestions</h2>
            {outcome.cancelled && (
              <p className="text-[10px] text-yellow-500/90 mt-0.5">Lookup cancelled — showing partial results</p>
            )}
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {withSuggestion.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-secondary z-10">
                <tr className="text-left text-[10px] text-text-tertiary uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium w-8" />
                  <th className="px-4 py-2.5 font-medium">Artist</th>
                  <th className="px-4 py-2.5 font-medium">Album</th>
                  <th className="px-4 py-2.5 font-medium">Current</th>
                  <th className="px-4 py-2.5 font-medium">Suggested</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {withSuggestion.map((r) => {
                  const key = albumKey(r);
                  return (
                    <tr
                      key={key}
                      onClick={() => toggleAlbum(key)}
                      className="border-t border-border-subtle cursor-pointer hover:bg-bg-hover transition-colors"
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={accepted.has(key)}
                          onChange={() => toggleAlbum(key)}
                          className="accent-accent"
                        />
                      </td>
                      <td className="px-4 py-2 text-text-secondary truncate max-w-[120px]" title={r.artist}>
                        {r.artist}
                      </td>
                      <td className="px-4 py-2 text-text-primary truncate max-w-[140px]" title={r.album}>
                        {r.album}
                      </td>
                      <td className="px-4 py-2 text-text-tertiary truncate max-w-[110px]" title={r.current_genre ?? ""}>
                        {r.current_genre || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={suggestionFor(r)}
                          onChange={(e) => editSuggestion(key, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Suggested genres for ${r.album}`}
                          className="w-[200px] bg-bg-primary border border-border rounded px-2 py-1 text-accent font-medium focus:outline-none focus:border-accent"
                        />
                      </td>
                      <td className="px-4 py-2 text-text-tertiary whitespace-nowrap">
                        {r.source ? SOURCE_LABELS[r.source] : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {withoutSuggestion.length > 0 && (
            <div className="px-4 py-3 border-t border-border">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
                No results ({withoutSuggestion.length}) — current genre kept
              </p>
              {withoutSuggestion.map((r) => (
                <p key={albumKey(r)} className="text-xs text-text-tertiary py-0.5">
                  {r.artist} — {r.album}
                  {r.current_genre ? ` (current: ${r.current_genre})` : ""}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">
            {accepted.size} of {withSuggestion.length} album{withSuggestion.length !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={accepted.size === 0}
              className="px-3 py-1.5 bg-accent/15 text-accent rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              Apply {accepted.size > 0 ? `(${accepted.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
