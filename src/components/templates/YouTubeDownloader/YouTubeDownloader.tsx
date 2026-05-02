import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { isValidYouTubeUrl, formatSeconds, fileNameFromPath } from "./helpers";
import { FormatButton } from "../../atoms/FormatButton/FormatButton";
import type { AudioFormat, DownloadProgress, DownloadResult, Phase, VideoInfo } from "./types";
import { useProgress } from "../../../contexts/ProgressContext";
import { useDependencyCheck } from "../../../hooks/useDependencyCheck";
import { cancelSync } from "../../../utils/cancelSync";
import { pickFolder } from "../../../utils/pickPath";

export const YouTubeDownloader = () => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const [phase, setPhase] = useState<Phase>("idle");
  const deps = useDependencyCheck("check_yt_dependencies");

  const [url, setUrl] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [format, setFormat] = useState<AudioFormat>("flac");

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let active = true;
    listen<DownloadProgress>("youtube-progress", (e) => {
      if (active) {
        updateProgress(e.payload.percent ?? 0, 100, e.payload.title ?? "");
      }
    }).then((fn) => {
      if (active) unlistenRef.current = fn;
      else fn();
    });

    return () => {
      active = false;
      unlistenRef.current?.();
    };
  }, []);

  const browse = async () => {
    try {
      const path = await pickFolder("Select output folder");
      if (path) setOutputDir(path);
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  };

  const fetchInfo = async () => {
    setPhase("fetching");
    setError(null);
    setVideoInfo(null);
    try {
      const info = await invoke<VideoInfo>("fetch_video_info", { url });
      setVideoInfo(info);
      setPhase("ready");
    } catch (e) {
      setError(`${e}`);
      setPhase("idle");
    }
  };

  const hasChapters = (videoInfo?.chapters.length ?? 0) > 0;

  const startDownload = async () => {
    setPhase("downloading");
    setResult(null);
    setError(null);
    startProgress("Downloading audio...", cancelSync);
    try {
      const res = await invoke<DownloadResult>("download_audio", {
        url,
        outputDir,
        format,
        chapters: videoInfo?.chapters ?? [],
      });
      setResult(res);
      setPhase("done");
      finishProgress(res.cancelled ? "Download cancelled" : "Download complete");
    } catch (e) {
      setError(`${e}`);
      setPhase("ready");
      failProgress(`${e}`);
    }
  };

  const reset = () => {
    setPhase("idle");
    setUrl("");
    setVideoInfo(null);
    setResult(null);
    setError(null);
  };

  const canDownload = isValidYouTubeUrl(url) && outputDir;

  // ── Dependencies missing ──

  if (deps.ok === false) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-text-secondary text-xs mb-2 font-medium">Missing required tools</p>
          <p className="text-text-tertiary text-[11px] mb-4 leading-relaxed">{deps.error}</p>
          <p className="text-text-tertiary text-[11px] mb-4">
            Run in your terminal:{" "}
            <code className="bg-bg-card px-1.5 py-0.5 rounded text-text-secondary">brew install yt-dlp ffmpeg</code>
          </p>
          <button
            onClick={deps.recheck}
            className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Loading deps check ──

  if (deps.ok === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-tertiary text-xs">
          <Spinner /> Checking dependencies...
        </div>
      </div>
    );
  }

  // ── Done ──

  if (phase === "done" && result) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          {result.cancelled ? (
            <div className="px-3 py-2 rounded-xl bg-warning/10 text-warning text-[11px] mb-4">Download cancelled</div>
          ) : result.success ? (
            <>
              {hasChapters ? (
                <div className="px-3 py-2 rounded-xl bg-success/10 text-success text-[11px] mb-4">
                  {`Download complete — ${result.file_paths.length} tracks`}
                </div>
              ) : (
                <div className="px-3 py-2 rounded-xl bg-success/10 text-success text-[11px] mb-4">
                  No chapters found. One audio file created.
                </div>
              )}
              {hasChapters && result.file_paths.length > 1 ? (
                <ul className="text-left mb-4 space-y-1 max-h-48 overflow-y-auto">
                  {result.file_paths.map((fp) => (
                    <li key={fp} className="text-text-tertiary text-[10px] truncate">
                      {fileNameFromPath(fp)}
                    </li>
                  ))}
                </ul>
              ) : (
                result.file_paths[0] && (
                  <p className="text-text-tertiary text-[10px] mb-4 truncate max-w-md">{result.file_paths[0]}</p>
                )
              )}
            </>
          ) : (
            <div className="px-3 py-2 rounded-xl bg-danger/10 text-danger text-[11px] mb-4">
              {result.error || "Download failed"}
            </div>
          )}
          <button
            onClick={reset}
            className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
          >
            {result.success && !hasChapters ? "OK" : "Download Another"}
          </button>
        </div>
      </div>
    );
  }

  // ── Downloading ──

  if (phase === "downloading") {
    return <div className="flex-1" />;
  }

  // ── Fetching info ──

  if (phase === "fetching") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-tertiary text-xs">
          <Spinner /> Fetching video info...
        </div>
      </div>
    );
  }

  // ── Ready (video info loaded) ──

  if (phase === "ready" && videoInfo) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md flex flex-col gap-3">
          <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3">
            <p className="text-[11px] font-medium text-text-primary mb-1 truncate">{videoInfo.title}</p>
            <p className="text-[10px] text-text-tertiary">
              {videoInfo.uploader} — {videoInfo.duration}
            </p>
          </div>

          {videoInfo.chapters.length > 0 && (
            <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3">
              <p className="text-[10px] font-medium text-text-secondary mb-2">
                {videoInfo.chapters.length} chapters — will split into individual tracks
              </p>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {videoInfo.chapters.map((ch, i) => (
                  <li key={i} className="text-[10px] text-text-tertiary flex justify-between">
                    <span className="truncate mr-2">{ch.title}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatSeconds(ch.start_time)} — {formatSeconds(ch.end_time)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Format</span>
            <div className="flex gap-1">
              <FormatButton label="FLAC" active={format === "flac"} onClick={() => setFormat("flac")} />
              <FormatButton label="MP3" active={format === "mp3"} onClick={() => setFormat("mp3")} />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={startDownload}
              className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
            >
              {hasChapters
                ? `Download ${videoInfo.chapters.length} tracks as ${format.toUpperCase()}`
                : `Download as ${format.toUpperCase()}`}
            </button>
            <button
              onClick={() => {
                setPhase("idle");
                setVideoInfo(null);
                setError(null);
              }}
              className="px-3 py-2.5 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:bg-bg-hover hover:text-text-primary transition-all"
            >
              Back
            </button>
          </div>

          {error && <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger">{error}</div>}
        </div>
      </div>
    );
  }

  // ── Idle ──

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md flex flex-col gap-3">
        <p className="text-text-tertiary text-xs text-center">Paste a YouTube URL to download audio</p>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full px-3 py-2 bg-bg-card border border-border rounded-xl text-[11px] text-text-primary outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
        />

        <FolderPicker label="Output" path={outputDir || null} onBrowse={browse} />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Format</span>
          <div className="flex gap-1">
            <FormatButton label="FLAC" active={format === "flac"} onClick={() => setFormat("flac")} />
            <FormatButton label="MP3" active={format === "mp3"} onClick={() => setFormat("mp3")} />
          </div>
          <span className="text-[10px] text-text-tertiary ml-1">
            {format === "flac" ? "44.1 kHz / 16-bit" : "320 kbps"}
          </span>
        </div>

        <button
          onClick={fetchInfo}
          disabled={!canDownload}
          className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Download
        </button>

        {error && <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger">{error}</div>}
      </div>
    </div>
  );
};
