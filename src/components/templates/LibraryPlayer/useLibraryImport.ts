import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { pickFolder } from "../../../utils/pickPath";
import { cancelSync } from "../../../utils/cancelSync";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { LibraryScanProgress, ImportProgress, ImportResult } from "../../../types/library";

export const useLibraryImport = (
  isActive: boolean,
  startProgress: (msg: string, cancelFn: () => Promise<void>) => void,
  updateProgress: (completed: number, total: number, currentFile: string) => void,
  finishProgress: (msg: string) => void,
  failProgress: (msg: string) => void,
  fetchBrowserData: () => Promise<void>,
  setHasLibrary: (v: boolean) => void,
  setDataLoaded: (v: boolean) => void,
) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) setIsDragOver(false);
  }, [isActive]);

  const handleChooseLibrary = useCallback(async () => {
    const selected = await pickFolder("Choose library location");
    if (!selected) return;

    startProgress("Scanning library...", cancelSync);

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("set_library_location", { path: selected });
      finishProgress("Library scan complete");
      setHasLibrary(true);
      await fetchBrowserData();
      setDataLoaded(true);
    } catch (e) {
      failProgress(`Scan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress, fetchBrowserData, setHasLibrary, setDataLoaded]);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      let location = await invoke<string | null>("get_library_location");
      if (!location) {
        const selected = await pickFolder("Choose library location");
        if (!selected) return;
        await invoke("set_library_location", { path: selected });
        location = selected;
      }

      startProgress("Importing to library...", cancelSync);

      const unlistenImport = await listen<ImportProgress>("import-progress", (e) => {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      });

      const unlistenScan = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      });

      try {
        const result = await invoke<ImportResult>("import_to_library", { paths });
        const msg =
          result.copied > 0
            ? `Imported ${result.copied} track${result.copied !== 1 ? "s" : ""}${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}`
            : result.skipped > 0
              ? `${result.skipped} track${result.skipped !== 1 ? "s" : ""} already in library`
              : "No audio files found";
        finishProgress(msg);
        setHasLibrary(true);
        await fetchBrowserData();
        setDataLoaded(true);
      } catch (e) {
        failProgress(`Import failed: ${e}`);
      } finally {
        unlistenImport();
        unlistenScan();
      }
    },
    [startProgress, updateProgress, finishProgress, failProgress, fetchBrowserData, setHasLibrary, setDataLoaded],
  );

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!active || !isActiveRef.current) return;
        if (event.payload.type === "enter") {
          setIsDragOver(true);
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          if (event.payload.paths.length > 0) {
            handleDrop(event.payload.paths);
          }
        }
      })
      .then((fn) => {
        if (active) unlisten = fn;
        else fn();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [handleDrop]);

  return { isDragOver, handleChooseLibrary, handleDrop };
};
