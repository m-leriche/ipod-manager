import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../../types/library";
import type { HealthIssue } from "./types";

interface HealthDetailModalProps {
  issue: HealthIssue;
  onClose: () => void;
}

type SortKey = "file_path" | "artist" | "album" | "title";
type SortDir = "asc" | "desc";

export const HealthDetailModal = ({ issue, onClose }: HealthDetailModalProps) => {
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("file_path");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await invoke<LibraryTrack[]>("get_health_issue_tracks", { issueId: issue.id });
        setTracks(data);
      } catch (e) {
        setError(`${e}`);
      }
    };
    load();
  }, [issue.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = tracks
    ? [...tracks].sort((a, b) => {
        const av = (a[sortKey] ?? "") as string;
        const bv = (b[sortKey] ?? "") as string;
        const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      })
    : [];

  const arrow = (key: SortKey) => {
    if (key !== sortKey) return null;
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const COLUMNS: { key: SortKey; label: string }[] = [
    { key: "file_path", label: "Path" },
    { key: "artist", label: "Artist" },
    { key: "album", label: "Album" },
    { key: "title", label: "Title" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="modal-backdrop" />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[800px] max-w-[95vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-medium text-text-primary">
            {issue.label} — {issue.count.toLocaleString()} tracks
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {error && <p className="text-danger text-xs p-4">{error}</p>}
          {!tracks && !error && <p className="text-text-tertiary text-xs p-4">Loading tracks...</p>}
          {tracks && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-secondary z-10">
                <tr className="text-left text-[10px] text-text-tertiary uppercase tracking-wider">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-2.5 font-medium cursor-pointer hover:text-text-secondary transition-colors select-none"
                    >
                      {col.label}
                      {arrow(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((track) => (
                  <tr key={track.id} className="border-t border-border-subtle hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-2 text-text-primary truncate max-w-[250px]" title={track.file_path}>
                      {track.file_name}
                    </td>
                    <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{track.artist || "—"}</td>
                    <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{track.album || "—"}</td>
                    <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{track.title || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0">
          <span className="text-[11px] text-text-tertiary">{sorted.length.toLocaleString()} tracks</span>
        </div>
      </div>
    </div>
  );
};
