import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { groupByVerdict } from "../QualityAnalyzer/helpers";
import type { AudioFileInfo, WaveformResult } from "../../../types/quality";
import type { Phase } from "./types";

interface QualityPreviewModal {
  type: "spectrogram" | "waveform";
  filePath: string;
}

export const useQualityActions = (
  lastScanPaths: React.MutableRefObject<string[]>,
  setPhase: (p: Phase) => void,
  setError: (e: string | null) => void,
  startProgress: (msg: string, cancelFn: () => Promise<void>) => void,
  finishProgress: (msg: string) => void,
  failProgress: (msg: string) => void,
  cancel: () => Promise<void>,
  setView: (v: "edit" | "repair" | "quality") => void,
) => {
  const [qualityFiles, setQualityFiles] = useState<AudioFileInfo[]>([]);
  const [selectedQualityFile, setSelectedQualityFile] = useState<string | null>(null);
  const [spectrograms, setSpectrograms] = useState<Record<string, string>>({});
  const [waveforms, setWaveforms] = useState<Record<string, WaveformResult>>({});
  const [qualityPreviewModal, setQualityPreviewModal] = useState<QualityPreviewModal | null>(null);

  const qualityGroups = useMemo(() => groupByVerdict(qualityFiles), [qualityFiles]);

  const qualityCounts = useMemo(() => {
    const c = { lossless: 0, lossy: 0, suspect: 0 };
    for (const f of qualityFiles) {
      if (f.verdict in c) c[f.verdict as keyof typeof c]++;
    }
    return c;
  }, [qualityFiles]);

  const selectedQualityData = useMemo(
    () => qualityFiles.find((f) => f.file_path === selectedQualityFile) ?? null,
    [qualityFiles, selectedQualityFile],
  );

  const startQualityScan = async () => {
    const paths = lastScanPaths.current;
    if (paths.length === 0) return;
    const targetPath = paths[0];

    setPhase("scanning");
    setError(null);
    setQualityFiles([]);
    setSelectedQualityFile(null);
    setSpectrograms({});
    setWaveforms({});
    startProgress("Analyzing audio quality...", cancel);
    try {
      const data = await invoke<AudioFileInfo[]>("scan_audio_quality", { path: targetPath });
      setQualityFiles(data);
      setView("quality");
      setPhase("scanned");
      finishProgress(`Analyzed ${data.length} files`);
    } catch (e) {
      const msg = `${e}`;
      if (msg.includes("Cancelled")) {
        setPhase("scanned");
        finishProgress("Quality scan cancelled");
      } else {
        setError(msg);
        setPhase("scanned");
        failProgress(msg);
      }
    }
  };

  const handleSpectrogramLoaded = useCallback((filePath: string, base64: string) => {
    setSpectrograms((prev) => ({ ...prev, [filePath]: base64 }));
  }, []);

  const handleWaveformLoaded = useCallback((filePath: string, result: WaveformResult) => {
    setWaveforms((prev) => ({ ...prev, [filePath]: result }));
  }, []);

  const handleOpenQualityPreview = useCallback(
    (type: "spectrogram" | "waveform") => {
      if (selectedQualityFile) {
        setQualityPreviewModal({ type, filePath: selectedQualityFile });
      }
    },
    [selectedQualityFile],
  );

  return {
    qualityFiles,
    selectedQualityFile,
    setSelectedQualityFile,
    spectrograms,
    waveforms,
    qualityPreviewModal,
    setQualityPreviewModal,
    qualityGroups,
    qualityCounts,
    selectedQualityData,
    startQualityScan,
    handleSpectrogramLoaded,
    handleWaveformLoaded,
    handleOpenQualityPreview,
  };
};
