import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNewReleases } from "../../../contexts/NewReleasesContext";
import { groupReleasesByArtist, formatReleaseDate, releaseTypeBadgeColor } from "./helpers";
import type { NewReleasesModalProps } from "./types";
import type { MbArtistCandidate, WatchedArtist } from "../../../types/releases";

export const NewReleasesModal = ({ onClose }: NewReleasesModalProps) => {
  const {
    checkState,
    releases,
    watchedArtists,
    startCheck,
    cancelCheck,
    dismissRelease,
    unwatchArtist,
    refreshWatchedArtists,
  } = useNewReleases();

  const [tab, setTab] = useState<"releases" | "artists">("releases");
  const [resolvingArtistId, setResolvingArtistId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<MbArtistCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleResolve = useCallback(async (artist: WatchedArtist) => {
    setResolvingArtistId(artist.id);
    setLoadingCandidates(true);
    try {
      const results = await invoke<MbArtistCandidate[]>("search_artist_mbid", {
        name: artist.name,
      });
      setCandidates(results);
    } catch {
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  const handlePickCandidate = useCallback(
    async (artistId: number, mbid: string, mbName: string) => {
      await invoke("set_watched_artist_mbid", { id: artistId, mbid, mbName });
      setResolvingArtistId(null);
      setCandidates([]);
      await refreshWatchedArtists();
    },
    [refreshWatchedArtists],
  );

  const groups = groupReleasesByArtist(releases);
  const ambiguousArtists = watchedArtists.filter((a) => a.match_status === "ambiguous");
  const progressPct =
    checkState.totalArtists > 0 ? Math.round((checkState.completedArtists / checkState.totalArtists) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[700px] max-h-[80vh] bg-bg-primary border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">New Releases</h2>
          <div className="flex-1" />

          {/* Tab switcher */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab("releases")}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                tab === "releases"
                  ? "bg-bg-card text-text-primary border border-border-active"
                  : "text-text-tertiary hover:text-text-secondary border border-transparent"
              }`}
            >
              Releases
              {releases.length > 0 && <span className="ml-1.5 text-text-tertiary">({releases.length})</span>}
            </button>
            <button
              onClick={() => setTab("artists")}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                tab === "artists"
                  ? "bg-bg-card text-text-primary border border-border-active"
                  : "text-text-tertiary hover:text-text-secondary border border-transparent"
              }`}
            >
              Watched Artists
              {watchedArtists.length > 0 && (
                <span className="ml-1.5 text-text-tertiary">({watchedArtists.length})</span>
              )}
            </button>
          </div>

          <button
            onClick={checkState.active ? cancelCheck : startCheck}
            disabled={watchedArtists.length === 0 && !checkState.active}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checkState.active ? "Cancel" : "Check Now"}
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        {checkState.active && (
          <div className="px-6 py-2 border-b border-border shrink-0">
            <div className="flex items-center gap-3 text-[11px] text-text-tertiary mb-1">
              <span>
                {checkState.phase === "resolving_mbid" ? "Resolving" : "Fetching releases"}
                {checkState.currentArtist && `: ${checkState.currentArtist}`}
              </span>
              <span className="ml-auto">
                {checkState.completedArtists}/{checkState.totalArtists}
              </span>
            </div>
            <div className="h-1 bg-bg-card rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {tab === "releases" && (
            <ReleasesTab
              groups={groups}
              onDismiss={dismissRelease}
              ambiguousArtists={ambiguousArtists}
              onResolve={handleResolve}
            />
          )}
          {tab === "artists" && (
            <ArtistsTab artists={watchedArtists} onUnwatch={unwatchArtist} onResolve={handleResolve} />
          )}
        </div>

        {/* Resolve modal */}
        {resolvingArtistId !== null && (
          <ResolveOverlay
            artistId={resolvingArtistId}
            artistName={watchedArtists.find((a) => a.id === resolvingArtistId)?.name || ""}
            candidates={candidates}
            loading={loadingCandidates}
            onPick={handlePickCandidate}
            onClose={() => {
              setResolvingArtistId(null);
              setCandidates([]);
            }}
          />
        )}
      </div>
    </div>
  );
};

// ── Releases Tab ────────────────────────────────────────────────

const ReleasesTab = ({
  groups,
  onDismiss,
  ambiguousArtists,
  onResolve,
}: {
  groups: ReturnType<typeof groupReleasesByArtist>;
  onDismiss: (id: number) => void;
  ambiguousArtists: WatchedArtist[];
  onResolve: (artist: WatchedArtist) => void;
}) => {
  if (groups.length === 0 && ambiguousArtists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary text-xs">
        <p>No new releases found.</p>
        <p className="mt-1">Watch some artists and click "Check Now" to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {ambiguousArtists.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
          <p className="text-[11px] text-yellow-400 font-medium mb-2">
            {ambiguousArtists.length} artist{ambiguousArtists.length !== 1 ? "s" : ""} need confirmation
          </p>
          <div className="space-y-1">
            {ambiguousArtists.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[11px]">
                <span className="text-text-secondary">{a.name}</span>
                <span className="text-text-tertiary">{a.mb_artist_name ? `→ ${a.mb_artist_name}?` : ""}</span>
                <button onClick={() => onResolve(a)} className="ml-auto text-accent hover:underline">
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.artistName}>
          <h3 className="text-xs font-semibold text-text-secondary mb-2">{group.artistName}</h3>
          <div className="space-y-1">
            {group.releases.map((release) => (
              <div
                key={release.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-card transition-colors group ${
                  release.inLibrary ? "opacity-50" : ""
                }`}
              >
                {release.releaseType && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${releaseTypeBadgeColor(release.releaseType)}`}
                  >
                    {release.releaseType}
                  </span>
                )}
                <span className="text-xs text-text-primary flex-1 min-w-0 truncate">{release.title}</span>
                {release.inLibrary && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
                    In Library
                  </span>
                )}
                <span className="text-[11px] text-text-tertiary shrink-0">
                  {formatReleaseDate(release.releaseDate)}
                </span>
                <button
                  onClick={() => onDismiss(release.id)}
                  className="p-0.5 rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-secondary transition-all"
                  title="Dismiss"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Artists Tab ──────────────────────────────────────────────────

const ArtistsTab = ({
  artists,
  onUnwatch,
  onResolve,
}: {
  artists: WatchedArtist[];
  onUnwatch: (id: number) => void;
  onResolve: (artist: WatchedArtist) => void;
}) => {
  if (artists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary text-xs">
        <p>No watched artists yet.</p>
        <p className="mt-1">Right-click an artist in the column browser to start watching.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {artists.map((artist) => (
        <div
          key={artist.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-card transition-colors group"
        >
          <span className="text-xs text-text-primary flex-1 min-w-0 truncate">{artist.name}</span>

          {artist.match_status === "matched" && <span className="text-[10px] text-green-400">Matched</span>}
          {artist.match_status === "manual" && <span className="text-[10px] text-accent">Manual</span>}
          {artist.match_status === "ambiguous" && (
            <button onClick={() => onResolve(artist)} className="text-[10px] text-yellow-400 hover:underline">
              Resolve
            </button>
          )}
          {artist.match_status === "pending" && <span className="text-[10px] text-text-tertiary">Pending</span>}

          {artist.mb_artist_name && artist.mb_artist_name !== artist.name && (
            <span className="text-[10px] text-text-tertiary truncate max-w-[150px]">→ {artist.mb_artist_name}</span>
          )}

          <button
            onClick={() => onUnwatch(artist.id)}
            className="p-0.5 rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
            title="Stop watching"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};

// ── Resolve Overlay ─────────────────────────────────────────────

const ResolveOverlay = ({
  artistId,
  artistName,
  candidates,
  loading,
  onPick,
  onClose,
}: {
  artistId: number;
  artistName: string;
  candidates: MbArtistCandidate[];
  loading: boolean;
  onPick: (artistId: number, mbid: string, mbName: string) => void;
  onClose: () => void;
}) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/30 rounded-xl" onClick={onClose} />
    <div className="relative w-[400px] bg-bg-primary border border-border rounded-lg shadow-xl p-4">
      <h3 className="text-xs font-semibold text-text-primary mb-1">Resolve: {artistName}</h3>
      <p className="text-[11px] text-text-tertiary mb-3">Pick the correct MusicBrainz match for this artist.</p>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-text-tertiary text-xs">Searching MusicBrainz...</div>
      ) : candidates.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-text-tertiary text-xs">No candidates found.</div>
      ) : (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(artistId, c.id, c.name)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-bg-card transition-colors"
            >
              <span className="text-xs text-text-primary">{c.name}</span>
              {c.disambiguation && <span className="text-[10px] text-text-tertiary">({c.disambiguation})</span>}
              <span className="ml-auto text-[10px] text-text-tertiary">{c.score}%</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-3">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);
