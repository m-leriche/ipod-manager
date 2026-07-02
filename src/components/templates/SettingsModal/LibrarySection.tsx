import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { pickFolder } from "../../../utils/pickPath";
import { getSetting, setSetting } from "../../../utils/settings";
import { SORT_SETTINGS_CHANGED_EVENT } from "../LibraryPlayer/useLibraryData";
import { BackupSection } from "./BackupSection";
import { SettingGroup, SettingToggle } from "./SettingGroup";

const SORT_FIELDS: { value: string; label: string }[] = [
  { value: "artist", label: "Artist" },
  { value: "album", label: "Album" },
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
  { value: "genre", label: "Genre" },
  { value: "date_added", label: "Date Added" },
  { value: "play_count", label: "Play Count" },
  { value: "duration", label: "Duration" },
];

const ALBUM_SORT_MODES: { value: string; label: string }[] = [
  { value: "album", label: "Album" },
  { value: "artist", label: "Artist" },
  { value: "year", label: "Year" },
  { value: "recent", label: "Recently Added" },
  { value: "alpha", label: "Alphabetical" },
];

const ID3_VERSIONS: { value: string; label: string; hint: string }[] = [
  { value: "v2.3", label: "ID3v2.3 (recommended)", hint: "Widest compatibility — Rockbox, classic iPods, iTunes." },
  {
    value: "v2.4",
    label: "ID3v2.4",
    hint: "Newer standard. Note: names containing “/” may be split into multiple values by some players.",
  },
];

export const LibrarySection = () => {
  const [sortBy, setSortBy] = useState(() => getSetting("sortBy"));
  const [sortDirection, setSortDirection] = useState(() => getSetting("sortDirection"));
  const [albumSortMode, setAlbumSortMode] = useState(() => getSetting("albumSortMode"));
  const [autoFetchArt, setAutoFetchArt] = useState(() => getSetting("autoFetchAlbumArt"));
  const [autoFetchLyrics, setAutoFetchLyrics] = useState(() => getSetting("autoFetchLyrics"));
  const [id3Version, setId3Version] = useState<string | null>(null);
  const [inboxLocation, setInboxLocation] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("get_id3_version")
      .then(setId3Version)
      .catch(() => setId3Version("v2.3"));
    invoke<string | null>("get_inbox_location")
      .then(setInboxLocation)
      .catch(() => setInboxLocation(null));
  }, []);

  const handleSetInboxLocation = useCallback(async () => {
    const selected = await pickFolder("Choose inbox folder");
    if (!selected) return;
    try {
      await invoke("set_inbox_location", { path: selected });
      setInboxLocation(selected);
    } catch (e) {
      console.warn("Failed to set inbox location:", e);
    }
  }, []);

  const applySort = useCallback((key: "sortBy" | "sortDirection" | "albumSortMode", value: string) => {
    setSetting(key, value);
    window.dispatchEvent(new Event(SORT_SETTINGS_CHANGED_EVENT));
  }, []);

  const handleSortBy = useCallback(
    (value: string) => {
      setSortBy(value);
      applySort("sortBy", value);
    },
    [applySort],
  );

  const handleSortDirection = useCallback(
    (value: string) => {
      setSortDirection(value);
      applySort("sortDirection", value);
    },
    [applySort],
  );

  const handleAlbumSortMode = useCallback(
    (value: string) => {
      setAlbumSortMode(value);
      applySort("albumSortMode", value);
    },
    [applySort],
  );

  const handleAutoFetchArt = useCallback((value: boolean) => {
    setAutoFetchArt(value);
    setSetting("autoFetchAlbumArt", value);
  }, []);

  const handleAutoFetchLyrics = useCallback((value: boolean) => {
    setAutoFetchLyrics(value);
    setSetting("autoFetchLyrics", value);
  }, []);

  const handleId3Version = useCallback(
    async (value: string) => {
      const previous = id3Version;
      setId3Version(value);
      try {
        await invoke("set_id3_version", { version: value });
      } catch {
        setId3Version(previous);
      }
    },
    [id3Version],
  );

  return (
    <>
      <SettingGroup title="Default Sort" description="How the library track list and album grid are sorted." first>
        <div className="flex flex-col gap-3 px-4 py-3 border border-border rounded-xl">
          <label className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-text-primary">Sort tracks by</span>
            <select
              value={sortBy}
              onChange={(e) => handleSortBy(e.target.value)}
              className="bg-bg-card border border-border rounded-md px-2 py-1 text-[11px] text-text-primary"
              data-testid="default-sort-by"
            >
              {SORT_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-text-primary">Direction</span>
            <select
              value={sortDirection}
              onChange={(e) => handleSortDirection(e.target.value)}
              className="bg-bg-card border border-border rounded-md px-2 py-1 text-[11px] text-text-primary"
              data-testid="default-sort-direction"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-text-primary">Sort albums by</span>
            <select
              value={albumSortMode}
              onChange={(e) => handleAlbumSortMode(e.target.value)}
              className="bg-bg-card border border-border rounded-md px-2 py-1 text-[11px] text-text-primary"
              data-testid="default-album-sort-mode"
            >
              {ALBUM_SORT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SettingGroup>

      <SettingGroup
        title="Inbox"
        description="A watched folder where new downloads land. Albums are checked before being filed into the library from the Inbox tab."
      >
        <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
          <span className="text-xs text-text-secondary truncate flex-1 min-w-0" data-testid="inbox-location">
            {inboxLocation ?? "Not configured"}
          </span>
          <button
            onClick={handleSetInboxLocation}
            className="text-[11px] text-accent hover:text-accent-hover transition-colors shrink-0"
            data-testid="inbox-location-change"
          >
            {inboxLocation ? "Change" : "Choose"}
          </button>
        </div>
      </SettingGroup>

      <SettingGroup title="After Import" description="Run these automatically when new tracks are imported.">
        <div className="flex flex-col gap-3 px-4 py-3 border border-border rounded-xl">
          <SettingToggle
            label="Fetch missing album art"
            hint="Looks for embedded art, then the MusicBrainz Cover Art Archive."
            checked={autoFetchArt}
            onChange={handleAutoFetchArt}
            testId="auto-fetch-art-toggle"
          />
          <SettingToggle
            label="Fetch missing lyrics"
            hint="Downloads synchronized lyrics from lrclib and embeds them in your files."
            checked={autoFetchLyrics}
            onChange={handleAutoFetchLyrics}
            testId="auto-fetch-lyrics-toggle"
          />
        </div>
      </SettingGroup>

      <SettingGroup
        title="Tag Format"
        description="ID3 version used when saving metadata to MP3 files. v2.3 is the safest choice for Rockbox and classic iPods."
      >
        {id3Version === null ? (
          <div className="text-xs text-text-tertiary py-4 text-center">Loading...</div>
        ) : (
          <div className="flex flex-col gap-3 px-4 py-3 border border-border rounded-xl">
            {ID3_VERSIONS.map((v) => (
              <label key={v.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="id3Version"
                  value={v.value}
                  checked={id3Version === v.value}
                  onChange={() => handleId3Version(v.value)}
                  className="accent-accent w-3 h-3 mt-0.5"
                  data-testid={`id3-version-${v.value}`}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-text-primary">{v.label}</span>
                  <span className="text-[9px] text-text-tertiary leading-snug">{v.hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </SettingGroup>

      <BackupSection />
    </>
  );
};
