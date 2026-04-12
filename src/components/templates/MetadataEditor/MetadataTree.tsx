import { useState } from "react";
import type { TrackMetadata } from "../../../types/metadata";
import type { ArtistGroup, EditableFields } from "./types";
import { isTrackDirty } from "./helpers";

interface MetadataTreeProps {
  groups: ArtistGroup[];
  editedTracks: Record<string, EditableFields>;
  selected: Set<string>;
  onToggleTrack: (filePath: string) => void;
  onSelectAlbum: (filePaths: string[]) => void;
  onSelectArtist: (filePaths: string[]) => void;
}

export const MetadataTree = ({
  groups,
  editedTracks,
  selected,
  onToggleTrack,
  onSelectAlbum,
  onSelectArtist,
}: MetadataTreeProps) => {
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(() => new Set(groups.map((g) => g.artist)));
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());

  const toggleArtist = (artist: string) => {
    setExpandedArtists((prev) => {
      const next = new Set(prev);
      next.has(artist) ? next.delete(artist) : next.add(artist);
      return next;
    });
  };

  const toggleAlbum = (key: string) => {
    setExpandedAlbums((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const isDirty = (track: TrackMetadata) => {
    const edited = editedTracks[track.file_path];
    return edited ? isTrackDirty(track, edited) : false;
  };

  const getEffectiveField = (track: TrackMetadata, field: keyof TrackMetadata) => {
    const edited = editedTracks[track.file_path];
    if (edited) {
      const val = edited[field as keyof EditableFields];
      if (val !== undefined && val !== "") return val;
    }
    return track[field];
  };

  return (
    <div className="flex-1 overflow-y-auto bg-bg-secondary border border-border rounded-2xl min-h-0">
      {groups.length === 0 ? (
        <div className="py-12 text-center text-text-tertiary text-xs">No audio files found</div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {groups.map((artistGroup) => {
            const artistPaths = artistGroup.albums.flatMap((a) => a.tracks.map((t) => t.file_path));
            const allSelected = artistPaths.length > 0 && artistPaths.every((p) => selected.has(p));
            const someSelected = artistPaths.some((p) => selected.has(p));
            const artistExpanded = expandedArtists.has(artistGroup.artist);

            return (
              <div key={artistGroup.artist}>
                {/* Artist row */}
                <div
                  className="flex items-center gap-2.5 py-2 px-4 cursor-pointer select-none hover:bg-bg-hover/50 transition-colors"
                  onClick={() => toggleArtist(artistGroup.artist)}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={(e) => {
                      e.stopPropagation();
                      onSelectArtist(artistPaths);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3.5 h-3.5 cursor-pointer accent-accent rounded shrink-0"
                  />
                  <span className="text-[10px] w-3.5 shrink-0 text-text-tertiary">
                    {artistExpanded ? "\u25be" : "\u25b8"}
                  </span>
                  <span className="text-xs font-medium text-text-primary truncate">{artistGroup.artist}</span>
                  <span className="text-[11px] text-text-tertiary ml-auto shrink-0">
                    {artistGroup.trackCount} tracks
                  </span>
                </div>

                {/* Albums */}
                {artistExpanded &&
                  artistGroup.albums.map((albumGroup) => {
                    const albumKey = `${artistGroup.artist}::${albumGroup.album}`;
                    const albumPaths = albumGroup.tracks.map((t) => t.file_path);
                    const allAlbumSelected = albumPaths.every((p) => selected.has(p));
                    const someAlbumSelected = albumPaths.some((p) => selected.has(p));
                    const albumExpanded = expandedAlbums.has(albumKey);

                    return (
                      <div key={albumKey}>
                        {/* Album row */}
                        <div
                          className="flex items-center gap-2.5 py-1.5 pr-4 cursor-pointer select-none hover:bg-bg-hover/50 transition-colors"
                          style={{ paddingLeft: "40px" }}
                          onClick={() => toggleAlbum(albumKey)}
                        >
                          <input
                            type="checkbox"
                            checked={allAlbumSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someAlbumSelected && !allAlbumSelected;
                            }}
                            onChange={(e) => {
                              e.stopPropagation();
                              onSelectAlbum(albumPaths);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 cursor-pointer accent-accent rounded shrink-0"
                          />
                          <span className="text-[10px] w-3.5 shrink-0 text-text-tertiary">
                            {albumExpanded ? "\u25be" : "\u25b8"}
                          </span>
                          <span className="text-[11px] font-medium text-text-secondary truncate">
                            {albumGroup.album}
                          </span>
                          <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
                            {albumGroup.tracks.length}
                          </span>
                        </div>

                        {/* Tracks */}
                        {albumExpanded &&
                          albumGroup.tracks.map((track) => {
                            const dirty = isDirty(track);
                            const trackSelected = selected.has(track.file_path);

                            return (
                              <div
                                key={track.file_path}
                                className={`flex items-center gap-2.5 py-[5px] pr-4 transition-colors hover:bg-bg-hover/50 ${
                                  trackSelected ? "bg-bg-hover/30" : ""
                                }`}
                                style={{ paddingLeft: "64px" }}
                                onClick={() => onToggleTrack(track.file_path)}
                              >
                                <input
                                  type="checkbox"
                                  checked={trackSelected}
                                  onChange={() => onToggleTrack(track.file_path)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-3.5 h-3.5 cursor-pointer accent-accent rounded shrink-0"
                                />
                                {dirty && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                                <span className="text-[11px] text-text-tertiary w-6 text-right shrink-0 tabular-nums">
                                  {getEffectiveField(track, "track") ?? ""}
                                </span>
                                <span
                                  className={`text-[11px] truncate flex-1 min-w-0 ${dirty ? "text-accent" : "text-text-secondary"}`}
                                >
                                  {getEffectiveField(track, "title") || track.file_name}
                                </span>
                                <span className="text-[10px] text-text-tertiary shrink-0 max-w-[120px] truncate">
                                  {getEffectiveField(track, "genre") ?? ""}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
