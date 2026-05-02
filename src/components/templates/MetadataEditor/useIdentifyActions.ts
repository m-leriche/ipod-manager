import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { IdentifyResult, AcoustIdMatch, Phase, View } from "./types";
import type { MetadataUpdate, MetadataSaveResult } from "../../../types/metadata";

export const useIdentifyActions = (
  setPhase: (p: Phase) => void,
  setError: (e: string | null) => void,
  setSaveResult: (r: MetadataSaveResult | null) => void,
  startProgress: (msg: string, cancelFn: () => Promise<void>) => void,
  finishProgress: (msg: string) => void,
  failProgress: (msg: string) => void,
  cancel: () => Promise<void>,
  refreshTracks: () => Promise<void>,
  setView: (v: View) => void,
) => {
  const [results, setResults] = useState<IdentifyResult[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, AcoustIdMatch>>({});

  const selectedResult = useMemo(
    () => results?.find((r) => r.file_path === selectedFile) ?? null,
    [results, selectedFile],
  );

  const matchedCount = useMemo(() => {
    if (!results) return 0;
    return results.filter((r) => r.matches.length > 0).length;
  }, [results]);

  const chosenCount = Object.keys(choices).length;

  const resetIdentify = useCallback(() => {
    setResults(null);
    setSelectedFile(null);
    setChoices({});
  }, []);

  const startIdentify = async (filePaths: string[]) => {
    if (filePaths.length === 0) return;
    setPhase("looking_up");
    setError(null);
    setResults(null);
    setChoices({});
    setSelectedFile(null);
    startProgress("Identifying tracks via AcoustID...", cancel);

    try {
      const data = await invoke<IdentifyResult[]>("identify_tracks", { filePaths });
      setResults(data);
      const matched = data.filter((r) => r.matches.length > 0).length;
      const firstMatch = data.find((r) => r.matches.length > 0);
      if (firstMatch) setSelectedFile(firstMatch.file_path);
      setPhase("scanned");
      setView("identify");
      finishProgress(`Identified ${matched} of ${data.length} tracks`);
    } catch (e) {
      const msg = `${e}`;
      if (msg === "Cancelled") {
        setPhase("scanned");
        failProgress("Identification cancelled");
      } else {
        setError(msg);
        setPhase("scanned");
        failProgress(msg);
      }
    }
  };

  const selectMatch = useCallback((filePath: string, match: AcoustIdMatch) => {
    setChoices((prev) => ({ ...prev, [filePath]: match }));
  }, []);

  const clearMatch = useCallback((filePath: string) => {
    setChoices((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
  }, []);

  const autoSelectBest = useCallback(() => {
    if (!results) return;
    const auto: Record<string, AcoustIdMatch> = {};
    for (const result of results) {
      if (result.matches.length > 0 && result.matches[0].score >= 0.8) {
        auto[result.file_path] = result.matches[0];
      }
    }
    setChoices(auto);
  }, [results]);

  const clearAll = useCallback(() => {
    setChoices({});
  }, []);

  const applyChoices = async () => {
    if (chosenCount === 0) return;

    const updates: MetadataUpdate[] = Object.entries(choices).map(([filePath, match]) => ({
      file_path: filePath,
      title: match.title ?? undefined,
      artist: match.artist ?? undefined,
      album: match.album ?? undefined,
      year: match.date ? parseYear(match.date) : undefined,
      track: match.track_number ?? undefined,
    }));

    setPhase("saving");
    setSaveResult(null);
    startProgress("Applying identified metadata...", cancel);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      setSaveResult(result);
      finishProgress(`Applied metadata to ${result.succeeded} of ${result.total} files`);
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

  return {
    results,
    selectedFile,
    setSelectedFile,
    selectedResult,
    choices,
    matchedCount,
    chosenCount,
    resetIdentify,
    startIdentify,
    selectMatch,
    clearMatch,
    autoSelectBest,
    clearAll,
    applyChoices,
  };
};

const parseYear = (date: string): number | undefined => {
  const m = date.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : undefined;
};
