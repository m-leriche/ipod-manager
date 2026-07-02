import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { cancelSync } from "../../../utils/cancelSync";
import { pickFolder } from "../../../utils/pickPath";
import { useProgress } from "../../../contexts/ProgressContext";
import { groupByVerdict } from "./helpers";
import type { AudioFileInfo, QualityScanProgress, WaveformResult, Phase } from "./types";

interface PreviewModal {
  type: "spectrogram" | "waveform";
  filePath: string;
}

/** Folder-driven quality scan state for the standalone Quality Analyzer tool. */
export const useQualityScan = () => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanPath, setScanPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<AudioFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [spectrograms, setSpectrograms] = useState<Record<string, string>>({});
  const [waveforms, setWaveforms] = useState<Record<string, WaveformResult>>({});
  const [previewModal, setPreviewModal] = useState<PreviewModal | null>(null);

  const groups = useMemo(() => groupByVerdict(files), [files]);

  const counts = useMemo(() => {
    const c = { lossless: 0, lossy: 0, suspect: 0 };
    for (const f of files) c[f.verdict]++;
    return c;
  }, [files]);

  const selectedData = useMemo(() => files.find((f) => f.file_path === selectedFile) ?? null, [files, selectedFile]);

  useEffect(() => {
    let active = true;
    let unsub: UnlistenFn | undefined;
    listen<QualityScanProgress>("quality-scan-progress", (e) => {
      if (active) updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    }).then((fn) => {
      if (active) unsub = fn;
      else fn();
    });
    return () => {
      active = false;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only subscription
  }, []);

  const scan = useCallback(
    async (path: string) => {
      setPhase("scanning");
      setError(null);
      setFiles([]);
      setSelectedFile(null);
      setSpectrograms({});
      setWaveforms({});
      startProgress("Analyzing audio quality...", cancelSync);
      try {
        const data = await invoke<AudioFileInfo[]>("scan_audio_quality", { path });
        setFiles(data);
        setPhase("scanned");
        finishProgress(`Analyzed ${data.length} files`);
      } catch (e) {
        const msg = `${e}`;
        setPhase("idle");
        if (msg.includes("Cancelled")) {
          finishProgress("Quality scan cancelled");
        } else {
          setError(msg);
          failProgress(msg);
        }
      }
    },
    [startProgress, finishProgress, failProgress],
  );

  const browse = useCallback(async () => {
    try {
      const path = await pickFolder("Select music folder");
      if (path) {
        setScanPath(path);
        scan(path);
      }
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  }, [scan]);

  const rescan = useCallback(() => {
    if (scanPath) scan(scanPath);
  }, [scan, scanPath]);

  const handleSpectrogramLoaded = useCallback((filePath: string, base64: string) => {
    setSpectrograms((prev) => ({ ...prev, [filePath]: base64 }));
  }, []);

  const handleWaveformLoaded = useCallback((filePath: string, result: WaveformResult) => {
    setWaveforms((prev) => ({ ...prev, [filePath]: result }));
  }, []);

  const openPreview = useCallback(
    (type: "spectrogram" | "waveform") => {
      if (selectedFile) setPreviewModal({ type, filePath: selectedFile });
    },
    [selectedFile],
  );

  return {
    phase,
    scanPath,
    error,
    files,
    groups,
    counts,
    selectedFile,
    setSelectedFile,
    selectedData,
    spectrograms,
    waveforms,
    previewModal,
    setPreviewModal,
    browse,
    rescan,
    handleSpectrogramLoaded,
    handleWaveformLoaded,
    openPreview,
  };
};
