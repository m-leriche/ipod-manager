import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WaveformResult } from "../../../types/quality";
import { getCachedPeaks, setCachedPeaks } from "./helpers";

export const useWaveformPeaks = (filePath: string | null): [number, number][] | null => {
  const [, setFetchTick] = useState(0);

  useEffect(() => {
    if (!filePath || getCachedPeaks(filePath)) return;

    let stale = false;
    invoke<WaveformResult>("generate_waveform", { filePath })
      .then((result) => {
        if (stale || !Array.isArray(result?.peaks) || result.peaks.length === 0) return;
        setCachedPeaks(filePath, result.peaks);
        setFetchTick((tick) => tick + 1);
      })
      .catch(() => {
        // Fail silent — the plain seek bar remains as fallback.
      });

    return () => {
      stale = true;
    };
  }, [filePath]);

  return filePath ? getCachedPeaks(filePath) : null;
};
