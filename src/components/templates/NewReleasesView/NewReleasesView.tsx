import { useState, useRef, useMemo, useCallback } from "react";
import { useNewReleases } from "../../../contexts/NewReleasesContext";
import { formatReleaseDate, sortReleases } from "./helpers";
import { useSplitWidths } from "./useSplitWidths";
import type { ReleaseSort, SortDir } from "./types";

export const NewReleasesView = () => {
  const { releases, watchedArtists, checkState, startCheck, cancelCheck, watchArtist, unwatchArtist, dismissRelease } =
    useNewReleases();

  const { widths, containerRef, onDragStart } = useSplitWidths();
  const [sortBy, setSortBy] = useState<ReleaseSort>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [artistInput, setArtistInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter releases by selected artist (using watched_artist_id, not name,
  // so MB-resolved names like "Björk" match the local watch name "Bjork")
  const filteredReleases = useMemo(() => {
    if (selectedArtistId === null) return releases;
    return releases.filter((r) => r.watched_artist_id === selectedArtistId);
  }, [releases, selectedArtistId]);

  const sorted = useMemo(() => sortReleases(filteredReleases, sortBy, sortDir), [filteredReleases, sortBy, sortDir]);

  const handleSort = useCallback(
    (col: ReleaseSort) => {
      if (sortBy === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(col);
        setSortDir(col === "date" ? "desc" : "asc");
      }
    },
    [sortBy],
  );

  const handleAddArtist = useCallback(() => {
    const name = artistInput.trim();
    if (!name) return;
    watchArtist(name);
    setArtistInput("");
    inputRef.current?.focus();
  }, [artistInput, watchArtist]);

  const progressPct = checkState.totalArtists > 0 ? (checkState.completedArtists / checkState.totalArtists) * 100 : 0;

  // Count releases per watched artist for the sidebar (keyed by artist ID
  // to avoid mismatches between local name and MB-resolved artist_name)
  const releaseCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of releases) {
      counts.set(r.watched_artist_id, (counts.get(r.watched_artist_id) ?? 0) + 1);
    }
    return counts;
  }, [releases]);

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Progress bar */}
      {checkState.active && (
        <div className="h-[2px] bg-accent/10 shrink-0">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* Two-column layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left: Artists column ──────────────────────────── */}
        <div
          className="min-w-0 flex flex-col relative border-r border-border"
          style={{ width: `${widths[0] * 100}%`, flex: "none" }}
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary shrink-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">Artists</span>
            {checkState.active ? (
              <button
                onClick={cancelCheck}
                className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                {checkState.currentArtist ? `Checking...` : "Cancel"}
              </button>
            ) : (
              <button
                onClick={startCheck}
                disabled={watchedArtists.length === 0}
                className="text-[10px] text-accent/70 hover:text-accent transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                Check Now
              </button>
            )}
          </div>

          {/* Add artist input */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddArtist();
              }}
              placeholder="Add artist..."
              className="flex-1 min-w-0 bg-transparent text-[11px] text-text-primary placeholder:text-text-tertiary/50 outline-none"
            />
            {artistInput.trim() && (
              <button
                onClick={handleAddArtist}
                className="text-[10px] text-accent/70 hover:text-accent transition-colors shrink-0"
              >
                Add
              </button>
            )}
          </div>

          {/* Artist list */}
          <div className="flex-1 overflow-y-auto">
            {/* "All" option */}
            <button
              onClick={() => setSelectedArtistId(null)}
              className={`w-full text-left px-3 py-[5px] text-[11px] transition-colors ${
                selectedArtistId === null ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"
              }`}
            >
              All Artists ({watchedArtists.length})
            </button>

            {watchedArtists.map((artist) => (
              <div
                key={artist.id}
                className={`group flex items-center gap-1 px-3 py-[5px] text-[11px] transition-colors cursor-default ${
                  selectedArtistId === artist.id ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"
                }`}
                onClick={() => setSelectedArtistId(artist.id === selectedArtistId ? null : artist.id)}
              >
                <span className="truncate flex-1">{artist.name}</span>
                {releaseCounts.get(artist.id) != null && (
                  <span
                    className={`text-[9px] shrink-0 ${
                      selectedArtistId === artist.id ? "text-white/60" : "text-text-tertiary"
                    }`}
                  >
                    {releaseCounts.get(artist.id)}
                  </span>
                )}
                {artist.match_status === "ambiguous" && (
                  <span
                    className={`text-[9px] shrink-0 ${
                      selectedArtistId === artist.id ? "text-white/60" : "text-yellow-400/70"
                    }`}
                    title="Could not auto-match"
                  >
                    ?
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedArtistId === artist.id) setSelectedArtistId(null);
                    unwatchArtist(artist.name);
                  }}
                  className={`opacity-0 group-hover:opacity-100 transition-all shrink-0 ${
                    selectedArtistId === artist.id
                      ? "text-white/60 hover:text-white"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                  title="Stop watching"
                  aria-label="Stop watching"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-2.5 h-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={onDragStart}
            className="absolute top-0 -right-[4px] w-[9px] h-full cursor-col-resize group/handle z-20"
          >
            <div className="absolute left-1 top-1 bottom-1 w-px bg-transparent group-hover/handle:bg-text-tertiary group-active/handle:bg-accent transition-colors" />
          </div>
        </div>

        {/* ── Right: Releases table ────────────────────────── */}
        <div className="min-w-0 flex flex-col" style={{ width: `${widths[1] * 100}%`, flex: "none" }}>
          {sorted.length === 0 && !checkState.active ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-text-tertiary">
                {watchedArtists.length === 0
                  ? "Add artists to start watching for new releases."
                  : selectedArtistId !== null
                    ? `No releases for ${watchedArtists.find((a) => a.id === selectedArtistId)?.name ?? "this artist"}.`
                    : "No new releases found. Hit Check Now to refresh."}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
                <colgroup>
                  <col style={{ width: 60 }} />
                  <col />
                  <col />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 36 }} />
                </colgroup>
                <thead
                  className="sticky top-0 z-10 bg-bg-primary"
                  style={{ boxShadow: "0 1px 0 0 var(--color-border)" }}
                >
                  <tr>
                    <SortHeader label="Type" col="type" sortBy={sortBy} sortDir={sortDir} onClick={handleSort} />
                    <SortHeader label="Title" col="title" sortBy={sortBy} sortDir={sortDir} onClick={handleSort} />
                    <SortHeader label="Artist" col="artist" sortBy={sortBy} sortDir={sortDir} onClick={handleSort} />
                    <SortHeader label="Date" col="date" sortBy={sortBy} sortDir={sortDir} onClick={handleSort} />
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary text-left bg-bg-primary">
                      Status
                    </th>
                    <th className="bg-bg-primary" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((release) => (
                    <tr
                      key={release.id}
                      className={`group hover:bg-bg-hover/50 transition-colors ${release.in_library ? "opacity-40" : ""}`}
                    >
                      <td className="px-3 py-[7px] text-[11px]">
                        <span
                          className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            release.release_type === "Album"
                              ? "bg-accent/15 text-accent"
                              : release.release_type === "EP"
                                ? "bg-green-500/15 text-green-400"
                                : "bg-text-tertiary/15 text-text-tertiary"
                          }`}
                        >
                          {release.release_type ?? "?"}
                        </span>
                      </td>
                      <td className="px-3 py-[7px] text-[11px] text-text-primary truncate">{release.title}</td>
                      <td className="px-3 py-[7px] text-[11px] text-text-secondary truncate">{release.artist_name}</td>
                      <td className="px-3 py-[7px] text-[11px] text-text-tertiary">
                        {formatReleaseDate(release.first_release_date)}
                      </td>
                      <td className="px-3 py-[7px] text-[10px]">
                        {release.in_library && <span className="text-green-400">In Library</span>}
                      </td>
                      <td className="px-3 py-[7px]">
                        <button
                          onClick={() => dismissRelease(release.id)}
                          className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-secondary transition-all"
                          title="Dismiss"
                          aria-label="Dismiss"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            className="w-3 h-3"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Status bar */}
          <div className="h-[26px] border-t border-border bg-bg-secondary px-3 flex items-center justify-center shrink-0 text-[10px] text-text-tertiary">
            {sorted.length > 0
              ? `${sorted.filter((r) => !r.in_library).length} new, ${sorted.filter((r) => r.in_library).length} in library`
              : `${watchedArtists.length} ${watchedArtists.length === 1 ? "artist" : "artists"} watched`}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sort header ────────────────────────────────────────────────

const SortHeader = ({
  label,
  col,
  sortBy,
  sortDir,
  onClick,
}: {
  label: string;
  col: ReleaseSort;
  sortBy: ReleaseSort;
  sortDir: SortDir;
  onClick: (col: ReleaseSort) => void;
}) => {
  const isActive = sortBy === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={`px-3 py-2 text-[10px] font-medium uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-text-primary bg-bg-primary text-left ${
        isActive ? "text-text-primary" : "text-text-tertiary"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && <span className="text-[8px]">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
      </span>
    </th>
  );
};
