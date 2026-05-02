import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { pickFiles } from "../../../utils/pickPath";
import { pickFolder } from "../../../utils/pickPath";
import { cancelSync } from "../../../utils/cancelSync";
import { useProgress } from "../../../contexts/ProgressContext";
import { useDependencyCheck } from "../../../hooks/useDependencyCheck";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { FLAC_PRESETS, formatDuration, formatFileInfo } from "./helpers";
import type { AudioProbeInfo, ConvertProgress, ConvertResult, ConvertRequest, TargetFormat, FlacPreset } from "./types";

const AUDIO_FILTERS = [
  { name: "Audio", extensions: ["mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac"] },
];

export const AudioConverter = () => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const dep = useDependencyCheck("check_ffmpeg");

  const [files, setFiles] = useState<AudioProbeInfo[]>([]);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>("mp3");
  const [mp3Bitrate, setMp3Bitrate] = useState<128 | 320>(320);
  const [flacPreset, setFlacPreset] = useState<FlacPreset>("16/44.1");
  const [outputDir, setOutputDir] = useState("");
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [converting, setConverting] = useState(false);

  // Listen for progress events
  useEffect(() => {
    let active = true;
    const unsubs: (() => void)[] = [];

    listen<ConvertProgress>("convert-progress", (e) => {
      if (active) {
        const p = e.payload;
        const overallPercent = ((p.file_index + p.percent / 100) / p.total_files) * 100;
        updateProgress(Math.round(overallPercent), 100, `${p.current_file} (${p.file_index + 1}/${p.total_files})`);
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

  const browseFiles = async () => {
    const paths = await pickFiles("Select audio files", AUDIO_FILTERS);
    if (!paths || paths.length === 0) return;
    setResult(null);

    startProgress("Probing files...", cancelSync);
    try {
      const probed = await invoke<AudioProbeInfo[]>("probe_audio_files", { paths });
      setFiles(probed.filter((f) => f.codec !== "error"));
      finishProgress(`Probed ${probed.length} files`);
    } catch (e) {
      failProgress(`${e}`);
    }
  };

  const browseOutput = async () => {
    const path = await pickFolder("Select output folder");
    if (path) setOutputDir(path);
  };

  const hasLossyToFlac = targetFormat === "flac" && files.some((f) => !f.is_lossless);
  const canConvert = files.length > 0 && outputDir && !converting;

  const startConvert = async () => {
    if (!canConvert) return;
    setConverting(true);
    setResult(null);

    const preset = FLAC_PRESETS[flacPreset];
    const requests: ConvertRequest[] = files.map((f) => ({
      input_path: f.file_path,
      output_dir: outputDir,
      target_format: targetFormat,
      mp3_bitrate: targetFormat === "mp3" ? mp3Bitrate : null,
      flac_sample_rate: targetFormat === "flac" ? preset.sample_rate : null,
      flac_bit_depth: targetFormat === "flac" ? preset.bit_depth : null,
    }));

    startProgress(`Converting ${requests.length} files...`, cancelSync);
    try {
      const res = await invoke<ConvertResult>("convert_audio", { requests });
      setResult(res);
      if (res.cancelled) {
        finishProgress("Conversion cancelled");
      } else if (res.failed > 0) {
        finishProgress(`Converted ${res.converted}, ${res.failed} failed`);
      } else {
        finishProgress(`Converted ${res.converted} files`);
      }
    } catch (e) {
      failProgress(`${e}`);
    } finally {
      setConverting(false);
    }
  };

  if (dep.error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-text-secondary text-xs mb-2">ffmpeg is required for audio conversion.</p>
          <p className="text-text-tertiary text-[11px]">{dep.error}</p>
          <button
            onClick={dep.recheck}
            className="mt-3 px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-xs hover:text-text-primary hover:border-border-active transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!dep.ok) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
        <button
          onClick={browseFiles}
          disabled={converting}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-xs hover:not-disabled:text-text-primary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
        >
          Select Files
        </button>

        {files.length > 0 && <span className="text-[11px] text-text-tertiary">{files.length} files</span>}

        <div className="flex-1" />

        {/* Format selector */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <button
            onClick={() => setTargetFormat("mp3")}
            disabled={converting}
            className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
              targetFormat === "mp3" ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            MP3
          </button>
          <button
            onClick={() => setTargetFormat("flac")}
            disabled={converting}
            className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
              targetFormat === "flac" ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            FLAC
          </button>
        </div>

        {/* Quality options */}
        {targetFormat === "mp3" && (
          <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
            <button
              onClick={() => setMp3Bitrate(128)}
              disabled={converting}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                mp3Bitrate === 128 ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              128 kbps
            </button>
            <button
              onClick={() => setMp3Bitrate(320)}
              disabled={converting}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                mp3Bitrate === 320 ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              320 kbps
            </button>
          </div>
        )}

        {targetFormat === "flac" && (
          <select
            value={flacPreset}
            onChange={(e) => setFlacPreset(e.target.value as FlacPreset)}
            disabled={converting}
            className="px-2 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] disabled:opacity-30"
          >
            {Object.entries(FLAC_PRESETS).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Lossy-to-lossless warning */}
      {hasLossyToFlac && (
        <div className="px-4 py-2.5 rounded-xl text-[11px] bg-warning/10 text-warning shrink-0">
          Some source files are lossy. Converting to FLAC wraps them in a lossless container without improving quality.
        </div>
      )}

      {/* Output folder + convert */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
        <FolderPicker label="Output" path={outputDir} onBrowse={browseOutput} disabled={converting} />
        <div className="flex-1" />
        <button
          onClick={startConvert}
          disabled={!canConvert}
          className="px-4 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium disabled:opacity-30 hover:not-disabled:opacity-90 transition-all"
        >
          {converting ? "Converting..." : "Convert"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`px-4 py-2.5 rounded-xl text-[11px] shrink-0 ${
            result.cancelled
              ? "bg-warning/10 text-warning"
              : result.failed > 0
                ? "bg-warning/10 text-warning"
                : "bg-success/10 text-success"
          }`}
        >
          {result.cancelled
            ? `Cancelled — converted ${result.converted} files before stopping`
            : `Converted ${result.converted} files${result.failed > 0 ? `, ${result.failed} failed` : ""}`}
          {result.warnings.length > 0 && (
            <div className="mt-1.5 text-[10px] opacity-70">
              {result.warnings.slice(0, 3).map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="mt-1.5 text-[10px] opacity-70">
              {result.errors.slice(0, 5).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File list */}
      {files.length > 0 ? (
        <div className="flex-1 bg-bg-secondary border border-border rounded-2xl overflow-y-auto min-h-0">
          <div className="px-4 py-3 border-b border-border sticky top-0 bg-bg-secondary z-10">
            <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
              Files ({files.length})
            </span>
          </div>
          <div className="divide-y divide-border">
            {files.map((f) => (
              <div key={f.file_path} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">{f.file_name}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {formatFileInfo(f.codec, f.sample_rate, f.bit_depth, f.bitrate_kbps)}
                  </div>
                </div>
                <span className="text-[10px] text-text-tertiary shrink-0">{formatDuration(f.duration)}</span>
                <span className={`text-[10px] font-medium shrink-0 ${f.is_lossless ? "text-success" : "text-warning"}`}>
                  {f.is_lossless ? "Lossless" : "Lossy"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-border rounded-2xl">
          <div className="text-center">
            <p className="text-text-tertiary text-xs">Select audio files to convert</p>
            <p className="text-text-tertiary/50 text-[10px] mt-1">FLAC, MP3, WAV, M4A, OGG, AIFF</p>
          </div>
        </div>
      )}
    </div>
  );
};
