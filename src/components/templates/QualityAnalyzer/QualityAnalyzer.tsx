import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { QualityList } from "./QualityList";
import { QualityDetailPanel } from "./QualityDetailPanel";
import { groupByVerdict, verdictColor } from "./helpers";
import type { AudioFileInfo, QualityScanProgress } from "../../../types/quality";
import type { Phase } from "./types";
import { useProgress } from "../../../contexts/ProgressContext";

export const QualityAnalyzer = () => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const [phase, setPhase] = useState<Phase>("idle");
  const [depsOk, setDepsOk] = useState<boolean | null>(null);
  const [depsError, setDepsError] = useState<string | null>(null);
  const [scanPath, setScanPath] = useState("");
  const [files, setFiles] = useState<AudioFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [spectrograms, setSpectrograms] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke("check_ffmpeg")
      .then(() => setDepsOk(true))
      .catch((e) => {
        setDepsOk(false);
        setDepsError(`${e}`);
      });

    let active = true;
    const unsubs: UnlistenFn[] = [];
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
  }, []);

  const browse = async () => {
    try {
      const picked = await open({ directory: true, multiple: false, title: "Select music folder" });
      if (picked) {
        const path = picked as string;
        setScanPath(path);
        scan(path);
      }
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  };

  const cancel = async () => {
    try {
      await invoke("cancel_sync");
    } catch (_) {}
  };

  const scan = async (path?: string) => {
    const targetPath = path ?? scanPath;
    setPhase("scanning");
    setError(null);
    setFiles([]);
    setSelectedFile(null);
    setSpectrograms({});
    startProgress("Analyzing audio quality...", cancel);
    try {
      const data = await invoke<AudioFileInfo[]>("scan_audio_quality", { path: targetPath });
      setFiles(data);
      setPhase("scanned");
      finishProgress(`Analyzed ${data.length} files`);
    } catch (e) {
      const msg = `${e}`;
      if (msg.includes("Cancelled")) {
        setPhase("idle");
        finishProgress("Scan cancelled");
      } else {
        setError(msg);
        setPhase("idle");
        failProgress(msg);
      }
    }
  };

  const groups = useMemo(() => groupByVerdict(files), [files]);

  const counts = useMemo(() => {
    const c = { lossless: 0, lossy: 0, suspect: 0 };
    for (const f of files) {
      if (f.verdict in c) c[f.verdict as keyof typeof c]++;
    }
    return c;
  }, [files]);

  const selected = useMemo(() => files.find((f) => f.file_path === selectedFile) ?? null, [files, selectedFile]);

  const handleSpectrogramLoaded = useCallback((filePath: string, base64: string) => {
    setSpectrograms((prev) => ({ ...prev, [filePath]: base64 }));
  }, []);

  // ── Dependencies missing ──

  if (depsOk === false) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-text-secondary text-xs mb-2 font-medium">Missing required tools</p>
          <p className="text-text-tertiary text-[11px] mb-4 leading-relaxed">{depsError}</p>
          <p className="text-text-tertiary text-[11px] mb-4">
            Run in your terminal:{" "}
            <code className="bg-bg-card px-1.5 py-0.5 rounded text-text-secondary">brew install ffmpeg</code>
          </p>
          <button
            onClick={() => {
              setDepsOk(null);
              invoke("check_ffmpeg")
                .then(() => setDepsOk(true))
                .catch((e) => {
                  setDepsOk(false);
                  setDepsError(`${e}`);
                });
            }}
            className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (depsOk === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-tertiary text-xs">
          <Spinner /> Checking dependencies...
        </div>
      </div>
    );
  }

  // ── Idle ──

  if (phase === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-text-tertiary text-xs mb-4">Scan a music folder to analyze audio quality</p>
          <div className="mb-4">
            <FolderPicker label="Folder" path={scanPath || null} onBrowse={browse} />
          </div>
          <button
            onClick={() => scan()}
            disabled={!scanPath}
            className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Scan Quality
          </button>
          {error && <p className="mt-3 text-danger text-[11px]">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Scanning ──

  if (phase === "scanning") {
    return <div className="flex-1" />;
  }

  // ── Scanned ──

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">Folder</span>
        <span className="flex-1 min-w-0 text-xs text-text-secondary font-medium truncate">{scanPath}</span>
        <span className="text-[11px] text-text-tertiary shrink-0">{files.length} files</span>
        <button
          onClick={browse}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-xs shrink-0 hover:text-text-secondary hover:border-border-active transition-all"
        >
          Browse
        </button>
        <button
          onClick={() => scan()}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-xs shrink-0 hover:text-text-secondary hover:border-border-active transition-all"
        >
          ↻ Rescan
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-5 px-5 py-2.5 bg-bg-secondary border border-border rounded-2xl shrink-0 text-xs font-medium">
        {counts.lossless > 0 && <span className={verdictColor("lossless")}>{counts.lossless} lossless</span>}
        {counts.lossy > 0 && <span className={verdictColor("lossy")}>{counts.lossy} lossy</span>}
        {counts.suspect > 0 && <span className={verdictColor("suspect")}>{counts.suspect} suspect</span>}
      </div>

      {error && <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger shrink-0">{error}</div>}

      {/* Main content */}
      <div className="flex-1 flex gap-3 min-h-0">
        <QualityList groups={groups} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
        {selected && (
          <QualityDetailPanel
            file={selected}
            spectrogramCache={spectrograms}
            onSpectrogramLoaded={handleSpectrogramLoaded}
          />
        )}
      </div>
    </>
  );
};
