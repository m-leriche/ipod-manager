import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNewReleases } from "../../../contexts/NewReleasesContext";
import { groupReleasesByArtist, formatReleaseDate, releaseTypeBadgeClasses } from "./helpers";
import type { NewReleasesPopoverProps } from "./types";

type Tab = "releases" | "artists";

export const NewReleasesPopover = ({ anchorRef, onClose }: NewReleasesPopoverProps) => {
  const { releases, checkState, startCheck, cancelCheck, dismissRelease, watchedArtists, watchArtist, unwatchArtist } =
    useNewReleases();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const [tab, setTab] = useState<Tab>("releases");

  // Position below the anchor element, aligned to the right
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, [anchorRef]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const groups = useMemo(() => groupReleasesByArtist(releases), [releases]);
  const ambiguousCount = watchedArtists.filter((a) => a.match_status === "ambiguous").length;
  const progressPct = checkState.totalArtists > 0 ? (checkState.completedArtists / checkState.totalArtists) * 100 : 0;

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 w-[380px] max-h-[480px] bg-bg-card border border-border rounded-xl shadow-2xl flex flex-col"
      style={{ top: position.top, right: position.right }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        {/* Tab buttons */}
        <div className="flex gap-1 flex-1">
          <button
            onClick={() => setTab("releases")}
            className={`text-[11px] font-medium transition-colors ${
              tab === "releases" ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Releases
          </button>
          <span className="text-text-tertiary/30 text-[11px]">/</span>
          <button
            onClick={() => setTab("artists")}
            className={`text-[11px] font-medium transition-colors ${
              tab === "artists" ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Artists
            {watchedArtists.length > 0 && (
              <span className="ml-1 text-[9px] text-text-tertiary">{watchedArtists.length}</span>
            )}
          </button>
        </div>
        {checkState.active ? (
          <button
            onClick={cancelCheck}
            className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button onClick={startCheck} className="text-[10px] text-accent/70 hover:text-accent transition-colors">
            Check Now
          </button>
        )}
        <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary transition-colors ml-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      {checkState.active && (
        <div className="h-[2px] bg-accent/10 shrink-0">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Checking state */}
        {checkState.active && checkState.currentArtist && (
          <div className="px-4 py-2 text-[10px] text-text-tertiary border-b border-border flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
            <span className="truncate">Checking {checkState.currentArtist}...</span>
          </div>
        )}

        {tab === "releases" ? (
          <ReleasesTab
            groups={groups}
            watchedArtists={watchedArtists}
            ambiguousCount={ambiguousCount}
            checkActive={checkState.active}
            onDismiss={dismissRelease}
          />
        ) : (
          <ArtistsTab artists={watchedArtists} onWatch={watchArtist} onUnwatch={unwatchArtist} />
        )}
      </div>
    </div>,
    document.body,
  );
};

// ── Releases tab ───────────────────────────────────────────────

const ReleasesTab = ({
  groups,
  watchedArtists,
  ambiguousCount,
  checkActive,
  onDismiss,
}: {
  groups: ReturnType<typeof groupReleasesByArtist>;
  watchedArtists: { length: number };
  ambiguousCount: number;
  checkActive: boolean;
  onDismiss: (id: number) => void;
}) => {
  if (groups.length === 0 && !checkActive) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[11px] text-text-tertiary">
          {watchedArtists.length === 0
            ? "No watched artists yet. Right-click an artist in the column browser to start watching."
            : "No new releases found."}
        </p>
      </div>
    );
  }

  return (
    <>
      {ambiguousCount > 0 && (
        <div className="px-4 py-2 text-[10px] text-text-tertiary border-b border-border">
          {ambiguousCount} {ambiguousCount === 1 ? "artist" : "artists"} couldn&apos;t be matched &mdash; right-click in
          the column browser to resolve
        </div>
      )}
      {groups.map((group) => (
        <div key={group.artistName} className="border-b border-border last:border-b-0">
          <div className="px-4 py-2">
            <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">
              {group.artistName}
            </span>
          </div>
          {group.releases.map((release) => (
            <div
              key={release.id}
              className={`group flex items-center gap-2 px-4 py-1.5 hover:bg-bg-hover/30 transition-colors ${
                release.in_library ? "opacity-40" : ""
              }`}
            >
              <span
                className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${releaseTypeBadgeClasses(release.release_type)}`}
              >
                {release.release_type ?? "?"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-text-primary truncate">{release.title}</div>
                <div className="text-[9px] text-text-tertiary">
                  {formatReleaseDate(release.first_release_date)}
                  {release.in_library && <span className="ml-1.5 text-green-400">In Library</span>}
                </div>
              </div>
              {!release.in_library && (
                <button
                  onClick={() => onDismiss(release.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-secondary transition-all shrink-0"
                  title="Dismiss"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
};

// ── Artists tab ─────────────────────────────────────────────────

const ArtistsTab = ({
  artists,
  onWatch,
  onUnwatch,
}: {
  artists: { id: number; name: string; match_status: string; mb_artist_name: string | null }[];
  onWatch: (name: string) => void;
  onUnwatch: (name: string) => void;
}) => {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    const name = input.trim();
    if (!name) return;
    onWatch(name);
    setInput("");
    inputRef.current?.focus();
  }, [input, onWatch]);

  return (
    <>
      {/* Add artist input */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Add artist..."
          className="flex-1 min-w-0 bg-transparent text-[11px] text-text-primary placeholder:text-text-tertiary/50 outline-none"
        />
        {input.trim() && (
          <button
            onClick={handleAdd}
            className="text-[10px] text-accent/70 hover:text-accent transition-colors shrink-0"
          >
            Add
          </button>
        )}
      </div>

      {artists.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[11px] text-text-tertiary">Type an artist name above to start watching.</p>
        </div>
      ) : (
        artists.map((artist) => (
          <div
            key={artist.id}
            className="group flex items-center gap-2 px-4 py-2 border-b border-border last:border-b-0 hover:bg-bg-hover/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-text-primary truncate">{artist.name}</div>
              {artist.mb_artist_name && artist.mb_artist_name !== artist.name && (
                <div className="text-[9px] text-text-tertiary truncate">Matched: {artist.mb_artist_name}</div>
              )}
            </div>
            {artist.match_status === "ambiguous" && (
              <span className="text-[9px] text-yellow-400/70" title="Could not auto-match on MusicBrainz">
                ?
              </span>
            )}
            {artist.match_status === "pending" && (
              <span className="text-[9px] text-text-tertiary" title="Not yet checked">
                pending
              </span>
            )}
            <button
              onClick={() => onUnwatch(artist.name)}
              className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-secondary transition-all shrink-0"
              title="Stop watching"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))
      )}
    </>
  );
};
