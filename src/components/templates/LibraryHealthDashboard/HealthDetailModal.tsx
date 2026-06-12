import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LibraryTrack } from "../../../types/library";
import type { HealthIssue } from "./types";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { AlphabetScroller } from "../../atoms/AlphabetScroller/AlphabetScroller";
import { buildLetterMap, buildTrackLetterMap, getTrackLetter, getValueLetter, groupTracksByAlbum } from "./helpers";
import { YearLookupModal } from "./YearLookupModal";
import { YearCell } from "./YearCell";
import { useHealthAutoFix } from "./useHealthAutoFix";

const ROW_HEIGHT = 32;

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
  const [sortKey, setSortKey] = useState<SortKey>("artist");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | undefined>();
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

  const {
    saving,
    autoFixStatus,
    setAutoFixStatus,
    yearLookupResults,
    setYearLookupResults,
    lookupProgress,
    handleAutoTitle,
    handleAutoTrackNumber,
    handleYearLookup,
    handleYearApply,
    handleSaveYears,
  } = useHealthAutoFix({ tracks, selectedIds, setSelectedIds, loadTracks, onDataChanged });

  const yearLookupResultsRef = useRef(yearLookupResults);
  yearLookupResultsRef.current = yearLookupResults;

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (contextMenuRef.current) {
          setContextMenu(null);
        } else if (yearLookupResultsRef.current) {
          setYearLookupResults(null);
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
  }, [onClose, tracks, setAutoFixStatus, setYearLookupResults]);

  const isMissingTitle = issue.id === "missing_title";
  const isMissingTrackNumber = issue.id === "missing_track_number";
  const isMissingYear = issue.id === "missing_year";
  const hasAutoFix = isMissingTitle || isMissingTrackNumber || isMissingYear;

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

  // Missing-year view shows one row per album; entering a year applies to all its tracks
  const albumGroups = useMemo(
    () => (isMissingYear && tracks ? groupTracksByAlbum(tracks) : null),
    [isMissingYear, tracks],
  );

  const albumSortField: "artist" | "album" = sortKey === "album" ? "album" : "artist";

  const sortedGroups = useMemo(
    () =>
      albumGroups
        ? [...albumGroups].sort((a, b) => {
            const cmp = a[albumSortField].localeCompare(b[albumSortField], undefined, { sensitivity: "base" });
            return sortDir === "asc" ? cmp : -cmp;
          })
        : null,
    [albumGroups, albumSortField, sortDir],
  );

  // Year edits are buffered per album key and only written when Save is clicked,
  // so years for many albums can be entered in one pass
  const [pendingYears, setPendingYears] = useState<Map<string, string>>(new Map());

  const handleYearDraftChange = useCallback((key: string, draft: string) => {
    setPendingYears((prev) => {
      const next = new Map(prev);
      if (draft) next.set(key, draft);
      else next.delete(key);
      return next;
    });
  }, []);

  const pendingYearCount = useMemo(
    () => [...pendingYears.values()].filter((v) => /^\d{4}$/.test(v)).length,
    [pendingYears],
  );

  const handleSavePendingYears = async () => {
    if (!albumGroups) return;
    const entries = albumGroups
      .filter((g) => /^\d{4}$/.test(pendingYears.get(g.key) ?? ""))
      .map((g) => ({ tracks: g.tracks, year: Number(pendingYears.get(g.key)) }));
    if (entries.length === 0) return;
    await handleSaveYears(entries);
    setPendingYears(new Map());
  };

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

  const lastClickedGroupRef = useRef<number | null>(null);

  const handleGroupRowClick = (index: number, e: React.MouseEvent) => {
    if (!sortedGroups) return;
    const ids = sortedGroups[index].tracks.map((t) => t.id);
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const allSelected = ids.every((id) => next.has(id));
        ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
        return next;
      });
    } else if (e.shiftKey && lastClickedGroupRef.current !== null) {
      const start = Math.min(lastClickedGroupRef.current, index);
      const end = Math.max(lastClickedGroupRef.current, index);
      const rangeIds = sortedGroups.slice(start, end + 1).flatMap((g) => g.tracks.map((t) => t.id));
      setSelectedIds((prev) => new Set([...prev, ...rangeIds]));
    } else {
      setSelectedIds(new Set(ids));
    }
    lastClickedGroupRef.current = index;
    setAutoFixStatus(null);
  };

  const handleContextMenu = (trackId: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (!onRepairMetadata && !hasAutoFix) return;
    if (!selectedIds.has(trackId)) {
      setSelectedIds(new Set([trackId]));
      lastClickedRef.current = trackId;
    }
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleGroupContextMenu = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (!sortedGroups) return;
    const ids = sortedGroups[index].tracks.map((t) => t.id);
    if (!ids.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set(ids));
      lastClickedGroupRef.current = index;
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

  const arrow = (key: SortKey) => {
    if (key !== sortKey) return null;
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const COLUMNS: { key: SortKey; label: string }[] = isMissingYear
    ? [
        { key: "artist", label: "Artist" },
        { key: "album", label: "Album" },
      ]
    : [
        { key: "file_path", label: "Path" },
        { key: "artist", label: "Artist" },
        { key: "album", label: "Album" },
        { key: "title", label: "Title" },
      ];
  const colCount = COLUMNS.length + (isMissingYear ? 2 : 0);

  const rowCount = sortedGroups ? sortedGroups.length : sorted.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  const sortField = sortKey === "file_path" ? "file_name" : sortKey;
  const letterMap = useMemo(
    () =>
      sortedGroups
        ? buildLetterMap(sortedGroups.map((g) => g[albumSortField]))
        : buildTrackLetterMap(sorted, sortField),
    [sortedGroups, albumSortField, sorted, sortField],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || rowCount === 0) return;
    const onScroll = () => {
      const topIndex = Math.min(Math.floor(el.scrollTop / ROW_HEIGHT), rowCount - 1);
      if (topIndex < 0) return;
      setActiveLetter(
        sortedGroups
          ? getValueLetter(sortedGroups[topIndex][albumSortField])
          : getTrackLetter(sorted[topIndex], sortField),
      );
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [sorted, sortedGroups, sortField, albumSortField, rowCount]);

  const handleLetterSelect = useCallback(
    (_letter: string, index: number) => {
      virtualizer.scrollToIndex(index, { align: "start" });
    },
    [virtualizer],
  );

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

        <div className="flex-1 flex min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
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
                    {isMissingYear && (
                      <>
                        <th className="px-4 py-2.5 font-medium">Tracks</th>
                        <th className="px-4 py-2.5 font-medium">Year</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paddingTop > 0 && (
                    <tr>
                      <td style={{ height: paddingTop, padding: 0 }} colSpan={colCount} />
                    </tr>
                  )}
                  {sortedGroups
                    ? virtualItems.map((virtualRow) => {
                        const group = sortedGroups[virtualRow.index];
                        const isSelected = group.tracks.every((t) => selectedIds.has(t.id));
                        return (
                          <tr
                            key={group.key}
                            style={{ height: ROW_HEIGHT }}
                            onClick={(e) => handleGroupRowClick(virtualRow.index, e)}
                            onContextMenu={(e) => handleGroupContextMenu(virtualRow.index, e)}
                            className={`border-t border-border-subtle cursor-default select-none transition-colors ${
                              isSelected ? "bg-accent/15" : "hover:bg-bg-hover"
                            }`}
                          >
                            <td className="px-4 py-2 text-text-secondary truncate max-w-[200px]">
                              {group.artist || "—"}
                            </td>
                            <td className="px-4 py-2 text-text-primary truncate max-w-[260px]">{group.album || "—"}</td>
                            <td className="px-4 py-2 text-text-tertiary">{group.tracks.length}</td>
                            <td className="px-2 py-1">
                              <YearCell
                                value={pendingYears.get(group.key) ?? ""}
                                label={`Year for ${group.album || group.artist || "unknown album"}`}
                                disabled={saving}
                                onChange={(draft) => handleYearDraftChange(group.key, draft)}
                              />
                            </td>
                          </tr>
                        );
                      })
                    : virtualItems.map((virtualRow) => {
                        const track = sorted[virtualRow.index];
                        const isSelected = selectedIds.has(track.id);
                        return (
                          <tr
                            key={track.id}
                            style={{ height: ROW_HEIGHT }}
                            onClick={(e) => handleRowClick(track.id, e)}
                            onContextMenu={(e) => handleContextMenu(track.id, e)}
                            className={`border-t border-border-subtle cursor-default select-none transition-colors ${
                              isSelected ? "bg-accent/15" : "hover:bg-bg-hover"
                            }`}
                          >
                            <td className="px-4 py-2 text-text-primary truncate max-w-[250px]" title={track.file_path}>
                              {track.file_name}
                            </td>
                            <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">
                              {track.artist || "—"}
                            </td>
                            <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">
                              {track.album || "—"}
                            </td>
                            <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">
                              {track.title || "—"}
                            </td>
                          </tr>
                        );
                      })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td style={{ height: paddingBottom, padding: 0 }} colSpan={colCount} />
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          {sorted.length > 0 && (
            <div className="shrink-0 flex items-center border-l border-border">
              <AlphabetScroller letterMap={letterMap} activeLetter={activeLetter} onLetterSelect={handleLetterSelect} />
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center gap-3">
          <span className="text-[11px] text-text-tertiary">
            {sortedGroups
              ? `${sortedGroups.length.toLocaleString()} albums (${sorted.length.toLocaleString()} tracks)`
              : `${sorted.length.toLocaleString()} tracks`}
          </span>
          {selectedCount > 0 && (
            <span className="text-[11px] text-text-secondary">
              {sortedGroups
                ? `${sortedGroups.filter((g) => g.tracks.every((t) => selectedIds.has(t.id))).length} selected`
                : `${selectedCount} selected`}
            </span>
          )}
          {lookupProgress && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-32 bg-bg-card border border-border rounded-full h-1.5 overflow-hidden shrink-0">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{
                    width: `${lookupProgress.total > 0 ? Math.round((lookupProgress.completed / lookupProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="text-[11px] text-text-tertiary shrink-0">
                {lookupProgress.completed}/{lookupProgress.total}
              </span>
              {lookupProgress.current && (
                <span className="text-[11px] text-text-tertiary truncate min-w-0">{lookupProgress.current}</span>
              )}
            </div>
          )}
          {!lookupProgress && autoFixStatus && <span className="text-[11px] text-text-secondary">{autoFixStatus}</span>}
          {!lookupProgress && <div className="flex-1" />}
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
          {isMissingYear && (
            <button
              onClick={handleYearLookup}
              disabled={saving || selectedCount === 0}
              title={selectedCount === 0 ? "Select albums to look up" : undefined}
              className="px-3 py-1.5 bg-accent/15 text-accent rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              {saving && lookupProgress ? "Looking up..." : "Look up year"}
            </button>
          )}
          {isMissingYear && pendingYearCount > 0 && (
            <button
              onClick={handleSavePendingYears}
              disabled={saving}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-[11px] font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : `Save ${pendingYearCount} year${pendingYearCount !== 1 ? "s" : ""}`}
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
