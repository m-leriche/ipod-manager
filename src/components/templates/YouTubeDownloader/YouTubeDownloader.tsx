import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { isValidYouTubeUrl } from "./helpers";
import type {
  AudioFormat,
  DownloadProgress,
  DownloadResult,
  Phase,
  VideoInfo,
} from "./types";

export const YouTubeDownloader = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [depsOk, setDepsOk] = useState<boolean | null>(null);
  const [depsError, setDepsError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [format, setFormat] = useState<AudioFormat>("flac");

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Check dependencies on mount and subscribe to progress events
  useEffect(() => {
    invoke("check_yt_dependencies")
      .then(() => setDepsOk(true))
      .catch((e) => {
        setDepsOk(false);
        setDepsError(`${e}`);
      });

    listen<DownloadProgress>("youtube-progress", (e) => {
      setProgress(e.payload);
    }).then((fn) => {
      unlistenRef.current = fn;
    });

    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const browse = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Select output folder",
      });
      if (picked) setOutputDir(picked as string);
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

  const startDownload = async () => {
    setPhase("downloading");
    setProgress(null);
    setResult(null);
    setError(null);
    try {
      const res = await invoke<DownloadResult>("download_audio", {
        url,
        outputDir,
        format,
      });
      setResult(res);
      setPhase("done");
    } catch (e) {
      setError(`${e}`);
      setPhase("ready");
    }
  };

  const cancel = async () => {
    try {
      await invoke("cancel_sync");
    } catch (_) {}
  };

  const reset = () => {
    setPhase("idle");
    setUrl("");
    setVideoInfo(null);
    setProgress(null);
    setResult(null);
    setError(null);
  };

  const canDownload = isValidYouTubeUrl(url) && outputDir;

  // ── Dependencies missing ──

  if (depsOk === false) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-text-secondary text-xs mb-2 font-medium">
            Missing required tools
          </p>
          <p className="text-text-tertiary text-[11px] mb-4 leading-relaxed">
            {depsError}
          </p>
          <p className="text-text-tertiary text-[11px] mb-4">
            Run in your terminal:{" "}
            <code className="bg-bg-card px-1.5 py-0.5 rounded text-text-secondary">
              brew install yt-dlp ffmpeg
            </code>
          </p>
          <button
            onClick={() => {
              setDepsOk(null);
              invoke("check_yt_dependencies")
                .then(() => setDepsOk(true))
                .catch((e) => {
                  setDepsOk(false);
                  setDepsError(`${e}`);
                });
            }}
            className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Loading deps check ──

  if (depsOk === null) {
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
            <div className="px-4 py-3 rounded-xl bg-warning/10 text-warning text-[11px] mb-4">
              Download cancelled
            </div>
          ) : result.success ? (
            <>
              <div className="px-4 py-3 rounded-xl bg-success/10 text-success text-[11px] mb-4">
                Download complete
              </div>
              {result.file_path && (
                <p className="text-text-tertiary text-[10px] mb-4 truncate max-w-md">
                  {result.file_path}
                </p>
              )}
            </>
          ) : (
            <div className="px-4 py-3 rounded-xl bg-danger/10 text-danger text-[11px] mb-4">
              {result.error || "Download failed"}
            </div>
          )}
          <button
            onClick={reset}
            className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
          >
            Download Another
          </button>
        </div>
      </div>
    );
  }

  // ── Downloading ──

  if (phase === "downloading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          {videoInfo && (
            <p className="text-text-secondary text-[11px] font-medium mb-3 truncate">
              {videoInfo.title}
            </p>
          )}
          <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-text-primary">
                {progress?.phase === "converting"
                  ? "Converting..."
                  : "Downloading..."}
              </span>
              <span className="text-[11px] text-text-secondary">
                {progress ? `${progress.percent.toFixed(1)}%` : "Starting..."}
              </span>
            </div>
            <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-text-primary rounded-full transition-all duration-200"
                style={{
                  width: `${progress?.percent ?? 0}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-tertiary flex-1 min-w-0 mr-3">
                {progress?.speed && `${progress.speed}`}
                {progress?.eta && ` — ETA ${progress.eta}`}
              </span>
              <button
                onClick={cancel}
                className="px-3 py-1 border border-danger/30 text-danger rounded-lg text-[10px] font-medium shrink-0 hover:bg-danger/10 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
        <div className="w-full max-w-md">
          <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-3 mb-4">
            <p className="text-[11px] font-medium text-text-primary mb-1 truncate">
              {videoInfo.title}
            </p>
            <p className="text-[10px] text-text-tertiary">
              {videoInfo.uploader} — {videoInfo.duration}
            </p>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">
              Format
            </span>
            <div className="flex gap-1">
              <FormatButton
                label="FLAC"
                active={format === "flac"}
                onClick={() => setFormat("flac")}
              />
              <FormatButton
                label="MP3"
                active={format === "mp3"}
                onClick={() => setFormat("mp3")}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={startDownload}
              className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
            >
              Download as {format.toUpperCase()}
            </button>
            <button
              onClick={() => {
                setPhase("idle");
                setVideoInfo(null);
                setError(null);
              }}
              className="px-3 py-2 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:bg-bg-hover hover:text-text-primary transition-all"
            >
              Back
            </button>
          </div>

          {error && (
            <div className="mt-3 px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Idle ──

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md">
        <p className="text-text-tertiary text-xs mb-4 text-center">
          Paste a YouTube URL to download audio
        </p>

        <div className="mb-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-3 py-2 bg-bg-card border border-border rounded-xl text-[11px] text-text-primary outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
          />
        </div>

        <div className="mb-3">
          <FolderPicker label="Output" path={outputDir || null} onBrowse={browse} />
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">
            Format
          </span>
          <div className="flex gap-1">
            <FormatButton
              label="FLAC"
              active={format === "flac"}
              onClick={() => setFormat("flac")}
            />
            <FormatButton
              label="MP3"
              active={format === "mp3"}
              onClick={() => setFormat("mp3")}
            />
          </div>
          <span className="text-[10px] text-text-tertiary ml-1">
            {format === "flac" ? "44.1 kHz / 16-bit" : "320 kbps"}
          </span>
        </div>

        <button
          onClick={fetchInfo}
          disabled={!canDownload}
          className="w-full px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Download
        </button>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const FormatButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
      active
        ? "bg-bg-card text-text-primary border border-border-active"
        : "text-text-tertiary border border-transparent hover:text-text-secondary"
    }`}
  >
    {label}
  </button>
);
