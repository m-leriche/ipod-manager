import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { sortAlbumsByIssues, issuesToUpdates, issueKey, allIssueKeys } from "./helpers";
import type { RepairReport, AlbumRepairReport, Phase } from "./types";
import type { MetadataSaveResult } from "../../../types/metadata";
import type { TrackMetadata } from "../../../types/metadata";

export const useRepairActions = (
  tracks: TrackMetadata[],
  setPhase: (p: Phase) => void,
  setError: (e: string | null) => void,
  setSaveResult: (r: MetadataSaveResult | null) => void,
  setSaveProgress: (p: null) => void,
  startProgress: (msg: string, cancelFn: () => Promise<void>) => void,
  finishProgress: (msg: string) => void,
  failProgress: (msg: string) => void,
  cancel: () => Promise<void>,
  refreshTracks: () => Promise<void>,
) => {
  const [report, setReport] = useState<RepairReport | null>(null);
  const [acceptedFixes, setAcceptedFixes] = useState<Set<string>>(new Set());
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const sortedAlbums = useMemo(() => (report ? sortAlbumsByIssues(report.albums) : []), [report]);

  const selectedAlbumData = useMemo(
    () => sortedAlbums.find((a) => a.folder_path === selectedAlbum) ?? null,
    [sortedAlbums, selectedAlbum],
  );

  const totalAccepted = acceptedFixes.size;

  const resetRepair = useCallback(() => {
    setReport(null);
    setAcceptedFixes(new Set());
    setSelectedAlbum(null);
  }, []);

  const startRepair = async () => {
    if (tracks.length === 0) return;
    setPhase("looking_up");
    setError(null);
    setReport(null);
    setAcceptedFixes(new Set());
    setSelectedAlbum(null);
    startProgress("Looking up albums on MusicBrainz...", cancel);

    try {
      const data = await invoke<RepairReport>("repair_analyze", { tracks });
      setReport(data);
      const sorted = sortAlbumsByIssues(data.albums);
      if (sorted.length > 0) setSelectedAlbum(sorted[0].folder_path);
      setPhase("scanned");
      const totalIssues =
        data.total_issues.error_count + data.total_issues.warning_count + data.total_issues.info_count;
      finishProgress(`Found ${totalIssues} issues across ${data.albums.length} albums`);
    } catch (e) {
      const msg = `${e}`;
      if (msg === "Cancelled") {
        setPhase("scanned");
        failProgress("Lookup cancelled");
      } else {
        setError(msg);
        setPhase("scanned");
        failProgress(msg);
      }
    }
  };

  const toggleFix = useCallback((key: string) => {
    setAcceptedFixes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const acceptAllForAlbum = useCallback((album: AlbumRepairReport) => {
    setAcceptedFixes((prev) => {
      const next = new Set(prev);
      for (const tm of album.track_matches) {
        for (const issue of tm.issues) {
          if (issue.suggested_value) next.add(issueKey(issue));
        }
      }
      return next;
    });
  }, []);

  const clearAllForAlbum = useCallback((album: AlbumRepairReport) => {
    setAcceptedFixes((prev) => {
      const next = new Set(prev);
      for (const tm of album.track_matches) {
        for (const issue of tm.issues) {
          next.delete(issueKey(issue));
        }
      }
      return next;
    });
  }, []);

  const handleSwitchRelease = useCallback(
    async (mbid: string) => {
      if (!selectedAlbumData) return;
      setSwitching(true);
      try {
        const localTracks = selectedAlbumData.track_matches.map((tm) => tm.local_track);
        const updated = await invoke<AlbumRepairReport>("repair_compare_release", { tracks: localTracks, mbid });
        setReport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            albums: prev.albums.map((a) =>
              a.folder_path === selectedAlbum ? { ...updated, alternative_releases: a.alternative_releases } : a,
            ),
          };
        });
        clearAllForAlbum(selectedAlbumData);
      } catch (e) {
        setError(`Failed to switch release: ${e}`);
      } finally {
        setSwitching(false);
      }
    },
    [selectedAlbumData, selectedAlbum, clearAllForAlbum, setError],
  );

  const handleApplyRepairs = async () => {
    if (!report || totalAccepted === 0) return;
    const updates = report.albums.flatMap((album) => issuesToUpdates(album, acceptedFixes));
    if (updates.length === 0) return;

    setPhase("saving");
    setSaveProgress(null);
    setSaveResult(null);
    startProgress("Applying fixes...", cancel);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      setSaveResult(result);
      setSaveProgress(null);
      finishProgress(`Applied fixes to ${result.succeeded} of ${result.total} files`);
      if (result.succeeded > 0) {
        refreshTracks();
      } else {
        setPhase("scanned");
      }
    } catch (e) {
      setError(`${e}`);
      setPhase("scanned");
      failProgress(`${e}`);
    }
  };

  const handleAcceptAllRepairs = useCallback(() => {
    if (!report) return;
    setAcceptedFixes(allIssueKeys(report.albums));
  }, [report]);

  const handleClearAllRepairs = useCallback(() => {
    setAcceptedFixes(new Set());
  }, []);

  return {
    report,
    acceptedFixes,
    selectedAlbum,
    setSelectedAlbum,
    switching,
    sortedAlbums,
    selectedAlbumData,
    totalAccepted,
    resetRepair,
    startRepair,
    toggleFix,
    acceptAllForAlbum,
    clearAllForAlbum,
    handleSwitchRelease,
    handleApplyRepairs,
    handleAcceptAllRepairs,
    handleClearAllRepairs,
  };
};
