import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MetadataScanProgress, MetadataSaveProgress, SanitizeProgress } from "../../../types/metadata";
import type { QualityScanProgress } from "../../../types/quality";
import type { RepairLookupProgress } from "./types";

export const useMetadataEvents = (
  updateProgress: (completed: number, total: number, currentFile: string) => void,
  setSaveProgress: (p: MetadataSaveProgress | null) => void,
) => {
  useEffect(() => {
    let active = true;
    const unsubs: UnlistenFn[] = [];

    listen<MetadataScanProgress>("metadata-scan-progress", (e) => {
      if (active) {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    listen<MetadataSaveProgress>("metadata-save-progress", (e) => {
      if (active) {
        setSaveProgress(e.payload);
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    listen<SanitizeProgress>("sanitize-progress", (e) => {
      if (active) {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    listen<RepairLookupProgress>("repair-lookup-progress", (e) => {
      if (active) {
        updateProgress(e.payload.completed_albums, e.payload.total_albums, e.payload.current_album);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    listen<QualityScanProgress>("quality-scan-progress", (e) => {
      if (active) {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    return () => {
      active = false;
      unsubs.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only subscription
  }, []);
};
