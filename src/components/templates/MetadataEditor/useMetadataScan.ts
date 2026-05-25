import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { pickFolder } from "../../../utils/pickPath";
import type { TrackMetadata, MetadataSaveResult } from "../../../types/metadata";
import type { Phase, View, EditableFields } from "./types";

interface UseMetadataScanParams {
  setPhase: (p: Phase) => void;
  setTracks: React.Dispatch<React.SetStateAction<TrackMetadata[]>>;
  setEditedTracks: React.Dispatch<React.SetStateAction<Record<string, EditableFields>>>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  setError: (e: string | null) => void;
  setSaveResult: (r: MetadataSaveResult | null) => void;
  setView: (v: View) => void;
  setUndoOperations: (ops: import("../../../types/metadata").MetadataUpdate[] | null) => void;
  onBeforeScan: () => void;
  startProgress: (msg: string, cancel: () => void) => void;
  finishProgress: (msg: string) => void;
  failProgress: (msg: string) => void;
  cancel: () => void;
}

export const useMetadataScan = ({
  setPhase,
  setTracks,
  setEditedTracks,
  setSelected,
  setError,
  setSaveResult,
  setView,
  setUndoOperations,
  onBeforeScan,
  startProgress,
  finishProgress,
  failProgress,
  cancel,
}: UseMetadataScanParams) => {
  const [scanPath, setScanPath] = useState("");
  const lastScanPaths = useRef<string[]>([]);

  const refreshTracks = useCallback(async () => {
    const paths = lastScanPaths.current;
    if (paths.length === 0) return;
    setEditedTracks({});
    setSaveResult(null);
    setError(null);
    try {
      const data = await invoke<TrackMetadata[]>("scan_metadata_paths", { paths });
      setTracks(data);
      setPhase("scanned");
    } catch (e) {
      setError(`Refresh failed: ${e}`);
      setPhase("scanned");
    }
  }, [setEditedTracks, setSaveResult, setError, setTracks, setPhase]);

  const doScan = useCallback(
    async (paths: string[], invokeFn: () => Promise<TrackMetadata[]>) => {
      lastScanPaths.current = paths;
      setPhase("scanning");
      setError(null);
      setSaveResult(null);
      setUndoOperations(null);
      setTracks([]);
      setEditedTracks({});
      setSelected(new Set());
      onBeforeScan();
      startProgress("Scanning metadata...", cancel);
      try {
        const data = await invokeFn();
        setTracks(data);
        setScanPath(paths.length === 1 ? paths[0] : `${paths.length} dropped items`);
        setPhase("scanned");
        setView("edit");
        finishProgress(`Scanned ${data.length} tracks`);
      } catch (e) {
        const msg = `${e}`;
        if (msg === "Cancelled") {
          setPhase("idle");
          failProgress("Scan cancelled");
        } else {
          setError(msg);
          setPhase("idle");
          failProgress(msg);
        }
      }
    },
    [
      setPhase,
      setError,
      setSaveResult,
      setUndoOperations,
      setTracks,
      setEditedTracks,
      setSelected,
      onBeforeScan,
      startProgress,
      finishProgress,
      failProgress,
      cancel,
      setView,
    ],
  );

  const scanPaths = useCallback(
    (paths: string[]) => doScan(paths, () => invoke<TrackMetadata[]>("scan_metadata_paths", { paths })),
    [doScan],
  );

  const scan = useCallback(
    (path?: string) => {
      const targetPath = path ?? scanPath;
      return doScan([targetPath], () => invoke<TrackMetadata[]>("scan_metadata", { path: targetPath }));
    },
    [doScan, scanPath],
  );

  const browse = useCallback(async () => {
    try {
      const path = await pickFolder("Select music folder");
      if (path) {
        setScanPath(path);
        const targetPath = path;
        doScan([targetPath], () => invoke<TrackMetadata[]>("scan_metadata", { path: targetPath }));
      }
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  }, [doScan, setError]);

  return { scanPath, scanPaths, scan, browse, refreshTracks };
};
