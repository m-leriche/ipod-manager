import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LibraryTrack } from "../../../types/library";
import type { MetadataUpdate, MetadataSaveResult } from "../../../types/metadata";
import type { AlbumYearQuery, AlbumYearResult } from "./types";
import { extractTitleFromFileName, extractTrackInfoFromFileName, extractYearFromAlbumTitle } from "./helpers";

export interface YearLookupProgress {
  completed: number;
  total: number;
  current: string;
}

export const useHealthAutoFix = (params: {
  tracks: LibraryTrack[] | null;
  selectedIds: Set<number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  loadTracks: () => Promise<void>;
  onDataChanged?: () => void;
}) => {
  const { tracks, selectedIds, setSelectedIds, loadTracks, onDataChanged } = params;
  const [saving, setSaving] = useState(false);
  const [autoFixStatus, setAutoFixStatus] = useState<string | null>(null);
  const [yearLookupResults, setYearLookupResults] = useState<AlbumYearResult[] | null>(null);
  const [lookupProgress, setLookupProgress] = useState<YearLookupProgress | null>(null);

  const applySaveUpdates = async (updates: MetadataUpdate[], label: string, totalSelected: number) => {
    setSaving(true);
    setAutoFixStatus(null);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      const skipped = totalSelected - updates.length;
      const parts: string[] = [`Applied ${label} to ${result.succeeded} track${result.succeeded !== 1 ? "s" : ""}`];
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

    await applySaveUpdates(updates, "titles", selected.length);
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

    await applySaveUpdates(updates, "track numbers", selected.length);
  };

  const handleYearLookup = async () => {
    if (!tracks || saving) return;
    const selected = tracks.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;

    // Group by unique artist+album, try extracting year from album title first
    const seen = new Set<string>();
    const extracted: AlbumYearResult[] = [];
    const needsLookup: AlbumYearQuery[] = [];
    for (const t of selected) {
      const artist = t.artist || "";
      const album = t.album || "";
      if (!artist || !album) continue;
      const key = `${artist}::${album}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const year = extractYearFromAlbumTitle(album);
      if (year) {
        extracted.push({ artist, album, suggested_year: year, release_title: `from album title` });
      } else {
        needsLookup.push({ artist, album });
      }
    }

    if (extracted.length === 0 && needsLookup.length === 0) {
      setAutoFixStatus("Selected tracks have no artist/album info to look up");
      return;
    }

    // If everything was extracted from titles, skip the API call
    if (needsLookup.length === 0) {
      setYearLookupResults(extracted);
      return;
    }

    setSaving(true);
    setAutoFixStatus(null);
    setLookupProgress({ completed: 0, total: needsLookup.length, current: "" });

    try {
      const unlisten = await listen<YearLookupProgress>("year-lookup-progress", (e) => {
        setLookupProgress(e.payload);
      });
      const apiResults = await invoke<AlbumYearResult[]>("lookup_album_years", { albums: needsLookup });
      unlisten();
      setYearLookupResults([...extracted, ...apiResults]);
      setAutoFixStatus(null);
    } catch (e) {
      setAutoFixStatus(`Error: ${e}`);
    } finally {
      setLookupProgress(null);
      setSaving(false);
    }
  };

  const handleYearApply = async (accepted: AlbumYearResult[]) => {
    if (!tracks) return;
    setYearLookupResults(null);

    const yearMap = new Map<string, number>();
    for (const r of accepted) {
      if (r.suggested_year) yearMap.set(`${r.artist}::${r.album}`, r.suggested_year);
    }

    const selected = tracks.filter((t) => selectedIds.has(t.id));
    const updates: MetadataUpdate[] = [];
    for (const t of selected) {
      const key = `${t.artist || ""}::${t.album || ""}`;
      const year = yearMap.get(key);
      if (year) updates.push({ file_path: t.file_path, year });
    }

    if (updates.length === 0) return;

    await applySaveUpdates(updates, "year", selected.length);
  };

  return {
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
  };
};
