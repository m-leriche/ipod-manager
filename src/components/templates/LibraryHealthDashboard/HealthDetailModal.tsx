import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../../types/library";
import type { MetadataUpdate, MetadataSaveResult } from "../../../types/metadata";
import type { HealthIssue, AlbumYearQuery, AlbumYearResult } from "./types";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { extractTitleFromFileName, extractTrackInfoFromFileName } from "./helpers";
import { YearLookupModal } from "./YearLookupModal";

interface HealthDetailModalProps {
  issue: HealthIssue;
  onClose: () => void;
  onRepairMetadata?: (tracks: LibraryTrack[]) => void;
  onDataChanged?: () => void;
}

type SortKey = "file_path" | "artist" | "album" | "title";
type SortDir = "asc" | "desc";

export const HealthDetailModal = ({ issue, onClose, onRepairMetadata, onDataChanged }: HealthDetailModalProps) => {
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("file_path");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [autoFixStatus, setAutoFixStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [yearLookupResults, setYearLookupResults] = useState<AlbumYearResult[] | null>(null);
  const lastClickedRef = useRef<number | null>(null);
  const contextMenuRef = useRef(contextMenu);
  contextMenuRef.current = contextMenu;

  const loadTracks = useCallback(async () => {
    try {
      const data = await invoke<LibraryTrack[]>("get_health_issue_tracks", { issueId: issue.id });
      setTracks(data);
    } catch (e) {
      setError(`${e}`);
    }
  }, [issue.id]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (contextMenuRef.current) {
          setContextMenu(null);
        } else {
          onClose();
        }
      }
      if (e.key === "a" && (e.metaKey || e.ctrlKey) && tracks && tracks.length > 0) {
        e.preventDefault();
        setSelectedIds(new Set(tracks.map((t) => t.id)));
        setAutoFixStatus(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, tracks]);

  const sorted = useMemo(
    () =>
      tracks
        ? [...tracks].sort((a, b) => {
            const av = (a[sortKey] ?? "") as string;
            const bv = (b[sortKey] ?? "") as string;
            const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
            return sortDir === "asc" ? cmp : -cmp;
          })
        : [],
    [tracks, sortKey, sortDir],
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleRowClick = (trackId: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
    } else if (e.shiftKey && lastClickedRef.current !== null) {
      const ids = sorted.map((t) => t.id);
      const from = ids.indexOf(lastClickedRef.current);
      const to = ids.indexOf(trackId);
      if (from !== -1 && to !== -1) {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        const range = new Set(ids.slice(start, end + 1));
        setSelectedIds((prev) => new Set([...prev, ...range]));
      }
    } else {
      setSelectedIds(new Set([trackId]));
    }
    lastClickedRef.current = trackId;
    setAutoFixStatus(null);
  };

  const isMissingTitle = issue.id === "missing_title";
  const isMissingTrackNumber = issue.id === "missing_track_number";
  const isMissingYear = issue.id === "missing_year";
  const hasAutoFix = isMissingTitle || isMissingTrackNumber || isMissingYear;

  const handleContextMenu = (trackId: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (!onRepairMetadata && !hasAutoFix) return;
    if (!selectedIds.has(trackId)) {
      setSelectedIds(new Set([trackId]));
      lastClickedRef.current = trackId;
    }
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleEditMetadata = () => {
    if (!onRepairMetadata || !tracks) return;
    const selected = tracks.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    onRepairMetadata(selected);
    onClose();
  };

  const handleAutoTitle = async () => {
    if (!tracks || saving) return;
    const selected = tracks.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;

    const updates: MetadataUpdate[] = [];
    for (const track of selected) {
      const title = extractTitleFromFileName(track.file_name);
      if (title) updates.push({ file_path: track.file_path, title });
    }

    if (updates.length === 0) {
      setAutoFixStatus("Could not extract titles from selected filenames");
      return;
    }

    setSaving(true);
    setAutoFixStatus(null);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      const skipped = selected.length - updates.length;
      const parts: string[] = [`Applied titles to ${result.succeeded} track${result.succeeded !== 1 ? "s" : ""}`];
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      setAutoFixStatus(parts.join(", "));
      setSelectedIds(new Set());
      await loadTracks();
      onDataChanged?.();
    } catch (e) {
      setAutoFixStatus(`Error: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoTrackNumber = async () => {
    if (!tracks || saving) return;
    const selected = tracks.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;

    const updates: MetadataUpdate[] = [];
    for (const track of selected) {
      const info = extractTrackInfoFromFileName(track.file_name);
      if (info) updates.push({ file_path: track.file_path, track: info.trackNumber, disc_number: info.discNumber });
    }

    if (updates.length === 0) {
      setAutoFixStatus("Could not extract track numbers from selected filenames");
      return;
    }

    setSaving(true);
    setAutoFixStatus(null);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      const skipped = selected.length - updates.length;
      const parts: string[] = [
        `Applied track numbers to ${result.succeeded} track${result.succeeded !== 1 ? "s" : ""}`,
      ];
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      setAutoFixStatus(parts.join(", "));
      setSelectedIds(new Set());
      await loadTracks();
      onDataChanged?.();
    } catch (e) {
      setAutoFixStatus(`Error: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleYearLookup = async () => {
    if (!tracks || saving) return;
    const selected = tracks.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;

    // Group tracks by artist+album to get unique album queries
    const seen = new Set<string>();
    const albums: AlbumYearQuery[] = [];
    for (const t of selected) {
      const artist = t.artist || "Unknown Artist";
      const album = t.album || "Unknown Album";
      const key = `${artist}::${album}`;
      if (!seen.has(key)) {
        seen.add(key);
        albums.push({ artist, album });
      }
    }

    setSaving(true);
    setAutoFixStatus(`Looking up ${albums.length} album${albums.length !== 1 ? "s" : ""}...`);
    try {
      const results = await invoke<AlbumYearResult[]>("lookup_album_years", { albums });
      setYearLookupResults(results);
      setAutoFixStatus(null);
    } catch (e) {
      setAutoFixStatus(`Error: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleYearApply = async (accepted: AlbumYearResult[]) => {
    if (!tracks) return;
    setYearLookupResults(null);

    // Build a map from artist::album → year for quick lookup
    const yearMap = new Map<string, number>();
    for (const r of accepted) {
      if (r.suggested_year) yearMap.set(`${r.artist}::${r.album}`, r.suggested_year);
    }

    // Build updates for all selected tracks that match accepted albums
    const selected = tracks.filter((t) => selectedIds.has(t.id));
    const updates: MetadataUpdate[] = [];
    for (const t of selected) {
      const key = `${t.artist || "Unknown Artist"}::${t.album || "Unknown Album"}`;
      const year = yearMap.get(key);
      if (year) updates.push({ file_path: t.file_path, year });
    }

    if (updates.length === 0) return;

    setSaving(true);
    setAutoFixStatus(null);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      const parts: string[] = [`Applied year to ${result.succeeded} track${result.succeeded !== 1 ? "s" : ""}`];
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      setAutoFixStatus(parts.join(", "));
      setSelectedIds(new Set());
      await loadTracks();
      onDataChanged?.();
    } catch (e) {
      setAutoFixStatus(`Error: ${e}`);
    } finally {
      setSaving(false);
    }
  };

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

  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="modal-backdrop" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-detail-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[800px] max-w-[95vw] max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="health-detail-title" className="text-sm font-medium text-text-primary">
            {issue.label} — {issue.count.toLocaleString()} tracks
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
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
                {sorted.map((track) => {
                  const isSelected = selectedIds.has(track.id);
                  return (
                    <tr
                      key={track.id}
                      onClick={(e) => handleRowClick(track.id, e)}
                      onContextMenu={(e) => handleContextMenu(track.id, e)}
                      className={`border-t border-border-subtle cursor-default select-none transition-colors ${
                        isSelected ? "bg-accent/15" : "hover:bg-bg-hover"
                      }`}
                    >
                      <td className="px-4 py-2 text-text-primary truncate max-w-[250px]" title={track.file_path}>
                        {track.file_name}
                      </td>
                      <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{track.artist || "—"}</td>
                      <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{track.album || "—"}</td>
                      <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{track.title || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center gap-3">
          <span className="text-[11px] text-text-tertiary">{sorted.length.toLocaleString()} tracks</span>
          {selectedCount > 0 && <span className="text-[11px] text-text-secondary">{selectedCount} selected</span>}
          {autoFixStatus && <span className="text-[11px] text-text-secondary">{autoFixStatus}</span>}
          <div className="flex-1" />
          {isMissingTitle && selectedCount > 0 && (
            <button
              onClick={handleAutoTitle}
              disabled={saving}
              className="px-3 py-1.5 bg-accent/15 text-accent rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Applying..." : "Auto-title from filename"}
            </button>
          )}
          {isMissingTrackNumber && selectedCount > 0 && (
            <button
              onClick={handleAutoTrackNumber}
              disabled={saving}
              className="px-3 py-1.5 bg-accent/15 text-accent rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Applying..." : "Auto-track number from filename"}
            </button>
          )}
          {isMissingYear && selectedCount > 0 && (
            <button
              onClick={handleYearLookup}
              disabled={saving}
              className="px-3 py-1.5 bg-accent/15 text-accent rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Looking up..." : "Look up year"}
            </button>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            ...(isMissingTitle
              ? [
                  {
                    label: `Auto-title from filename (${selectedCount} track${selectedCount !== 1 ? "s" : ""})`,
                    onClick: () => {
                      setContextMenu(null);
                      handleAutoTitle();
                    },
                  },
                ]
              : []),
            ...(isMissingTrackNumber
              ? [
                  {
                    label: `Auto-track number from filename (${selectedCount} track${selectedCount !== 1 ? "s" : ""})`,
                    onClick: () => {
                      setContextMenu(null);
                      handleAutoTrackNumber();
                    },
                  },
                ]
              : []),
            ...(isMissingYear
              ? [
                  {
                    label: `Look up year (${selectedCount} track${selectedCount !== 1 ? "s" : ""})`,
                    onClick: () => {
                      setContextMenu(null);
                      handleYearLookup();
                    },
                  },
                ]
              : []),
            ...(onRepairMetadata
              ? [
                  {
                    label: `Edit Metadata (${selectedCount} track${selectedCount !== 1 ? "s" : ""})`,
                    onClick: handleEditMetadata,
                  },
                ]
              : []),
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {yearLookupResults && (
        <YearLookupModal
          results={yearLookupResults}
          onApply={handleYearApply}
          onCancel={() => setYearLookupResults(null)}
        />
      )}
    </div>
  );
};
