import { useState } from "react";
import type { AlbumYearResult } from "./types";

interface YearLookupModalProps {
  results: AlbumYearResult[];
  onApply: (accepted: AlbumYearResult[]) => void;
  onCancel: () => void;
}

export const YearLookupModal = ({ results, onApply, onCancel }: YearLookupModalProps) => {
  const withYear = results.filter((r) => r.suggested_year !== null);
  const withoutYear = results.filter((r) => r.suggested_year === null);
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(withYear.map(albumKey)));

  const toggleAlbum = (key: string) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApply = () => {
    const selected = withYear.filter((r) => accepted.has(albumKey(r)));
    onApply(selected);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[600px] max-w-[95vw] max-h-[70vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-medium text-text-primary">Confirm Year Suggestions</h2>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {withYear.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-secondary z-10">
                <tr className="text-left text-[10px] text-text-tertiary uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium w-8" />
                  <th className="px-4 py-2.5 font-medium">Artist</th>
                  <th className="px-4 py-2.5 font-medium">Album</th>
                  <th className="px-4 py-2.5 font-medium">Year</th>
                  <th className="px-4 py-2.5 font-medium">MB Release</th>
                </tr>
              </thead>
              <tbody>
                {withYear.map((r) => {
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
                      <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{r.artist}</td>
                      <td className="px-4 py-2 text-text-primary truncate max-w-[160px]">{r.album}</td>
                      <td className="px-4 py-2 text-accent font-medium">{r.suggested_year}</td>
                      <td className="px-4 py-2 text-text-tertiary truncate max-w-[140px]" title={r.release_title ?? ""}>
                        {r.release_title ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {withoutYear.length > 0 && (
            <div className="px-4 py-3 border-t border-border">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
                No results ({withoutYear.length})
              </p>
              {withoutYear.map((r) => (
                <p key={albumKey(r)} className="text-xs text-text-tertiary py-0.5">
                  {r.artist} — {r.album}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">
            {accepted.size} of {withYear.length} album{withYear.length !== 1 ? "s" : ""} selected
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

const albumKey = (r: { artist: string; album: string }): string => `${r.artist}::${r.album}`;
