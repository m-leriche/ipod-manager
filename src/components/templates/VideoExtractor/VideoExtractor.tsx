import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { FormatButton } from "../../atoms/FormatButton/FormatButton";
import { ChapterEditor } from "./ChapterEditor";
import { buildChapters, fileNameFromPath } from "./helpers";
import type { VideoProbe, EditableChapter, Phase, AudioFormat, DownloadProgress, DownloadResult } from "./types";
import { useProgress } from "../../../contexts/ProgressContext";
import { useDependencyCheck } from "../../../hooks/useDependencyCheck";
import { cancelSync } from "../../../utils/cancelSync";
import { pickFolder, pickFile } from "../../../utils/pickPath";

export const VideoExtractor = () => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const [phase, setPhase] = useState<Phase>("idle");
  const deps = useDependencyCheck("check_ffmpeg");

  const [videoPath, setVideoPath] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoProbe | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [format, setFormat] = useState<AudioFormat>("flac");
  const [chapters, setChapters] = useState<EditableChapter[]>([]);
  const [chapterErrors, setChapterErrors] = useState<Record<number, string>>({});
  const [nextChapterId, setNextChapterId] = useState(1);

  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubs: UnlistenFn[] = [];
    listen<DownloadProgress>("video-extract-progress", (e) => {
      if (active) {
        updateProgress(e.payload.percent ?? 0, 100, e.payload.title ?? "");
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

  const browseVideo = async () => {
    try {
      const path = await pickFile("Select video file", [
        { name: "Video", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "m4v", "ts"] },
      ]);
      if (path) {
        setVideoPath(path);
        setError(null);
        setVideoInfo(null);
        setChapters([]);
        setChapterErrors({});
        setNextChapterId(1);
        try {
          const info = await invoke<VideoProbe>("probe_video", { path });
          setVideoInfo(info);
        } catch (e) {
          setError(`Failed to read video: ${e}`);
        }
      }
    } catch (e) {
      setError(`Failed to open file picker: ${e}`);
    }
  };

  const browseOutput = async () => {
    try {
      const path = await pickFolder("Select output folder");
      if (path) setOutputDir(path);
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  };

  const addChapter = () => {
    setChapters([...chapters, { id: nextChapterId, title: "", timestamp: "" }]);
    setNextChapterId(nextChapterId + 1);
  };

  const removeChapter = (id: number) => {
    setChapters(chapters.filter((ch) => ch.id !== id));
    setChapterErrors((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const updateChapter = (id: number, field: "title" | "timestamp", value: string) => {
    setChapters(chapters.map((ch) => (ch.id === id ? { ...ch, [field]: value } : ch)));
    if (chapterErrors[id]) {
      setChapterErrors((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const startExtract = async () => {
    if (!videoInfo || !outputDir) return;

    let parsedChapters: { title: string; start_time: number; end_time: number }[] = [];
    if (chapters.length > 0) {
      const built = buildChapters(chapters, videoInfo.duration);
      if (Object.keys(built.errors).length > 0) {
        setChapterErrors(built.errors);
        return;
      }
      parsedChapters = built.chapters;
    }

    setPhase("extracting");
    setResult(null);
    setError(null);
    startProgress("Extracting audio...", cancelSync);

    try {
      const res = await invoke<DownloadResult>("extract_audio_from_video", {
        path: videoPath,
        outputDir,
        format,
        chapters: parsedChapters,
      });
      setResult(res);
      setPhase("done");
      finishProgress(res.cancelled ? "Extraction cancelled" : "Extraction complete");
    } catch (e) {
      setError(`${e}`);
      setPhase("idle");
      failProgress(`${e}`);
    }
  };

  const reset = () => {
    setPhase("idle");
    setVideoPath("");
    setVideoInfo(null);
    setOutputDir("");
    setChapters([]);
    setChapterErrors({});
    setNextChapterId(1);
    setResult(null);
    setError(null);
  };

  const canExtract = !!videoInfo && !!outputDir;

  // ── Dependencies missing ──

  if (deps.ok === false) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-text-secondary text-xs mb-2 font-medium">Missing required tools</p>
          <p className="text-text-tertiary text-[11px] mb-4 leading-relaxed">{deps.error}</p>
          <p className="text-text-tertiary text-[11px] mb-4">
            Run in your terminal:{" "}
            <code className="bg-bg-card px-1.5 py-0.5 rounded text-text-secondary">brew install ffmpeg</code>
          </p>
          <button
            onClick={deps.recheck}
            className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
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
            <div className="px-3 py-2 rounded-xl bg-warning/10 text-warning text-[11px] mb-4">Extraction cancelled</div>
          ) : result.success ? (
            <>
              <div className="px-3 py-2 rounded-xl bg-success/10 text-success text-[11px] mb-4">
                {result.file_paths.length > 1
                  ? `Extraction complete — ${result.file_paths.length} tracks`
                  : "Extraction complete — 1 audio file created"}
              </div>
              {result.file_paths.length > 1 ? (
                <ul className="text-left mb-4 space-y-1 max-h-48 overflow-y-auto">
                  {result.file_paths.map((fp) => (
                    <li key={fp} className="text-text-tertiary text-[11px] truncate">
                      {fileNameFromPath(fp)}
                    </li>
                  ))}
                </ul>
              ) : (
                result.file_paths[0] && (
                  <p className="text-text-tertiary text-[11px] mb-4 truncate max-w-md">{result.file_paths[0]}</p>
                )
              )}
            </>
          ) : (
            <div className="px-3 py-2 rounded-xl bg-danger/10 text-danger text-[11px] mb-4">
              {result.error || "Extraction failed"}
            </div>
          )}
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:opacity-90"
          >
            Extract Another
          </button>
        </div>
      </div>
    );
  }

  // ── Extracting ──

  if (phase === "extracting") {
    return <div className="flex-1" />;
  }

  // ── Idle (main editing view) ──

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md flex flex-col gap-3">
        <p className="text-text-tertiary text-xs text-center">Select a video file to extract audio</p>

        {/* Video file picker */}
        <div
          className="flex items-center gap-3 bg-bg-secondary border border-border rounded-xl px-4 py-2.5 cursor-pointer hover:border-border-active transition-colors"
          onClick={browseVideo}
        >
          <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">Video</span>
          <span
            className={`flex-1 min-w-0 text-xs font-medium truncate ${videoPath ? "text-text-secondary" : "text-text-tertiary"}`}
          >
            {videoPath ? fileNameFromPath(videoPath) : "No file selected"}
          </span>
          <span className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium shrink-0">
            Browse
          </span>
        </div>

        {/* Video info */}
        {videoInfo && (
          <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3">
            <p className="text-xs font-medium text-text-primary truncate">{videoInfo.title}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">Duration: {videoInfo.duration_display}</p>
          </div>
        )}

        {/* Chapter editor */}
        {videoInfo && (
          <ChapterEditor
            chapters={chapters}
            errors={chapterErrors}
            onAdd={addChapter}
            onRemove={removeChapter}
            onChange={updateChapter}
          />
        )}

        {/* Output folder */}
        <FolderPicker label="Output" path={outputDir || null} onBrowse={browseOutput} />

        {/* Format selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">Format</span>
          <div className="flex gap-1">
            <FormatButton label="FLAC" active={format === "flac"} onClick={() => setFormat("flac")} />
            <FormatButton label="MP3" active={format === "mp3"} onClick={() => setFormat("mp3")} />
          </div>
          <span className="text-[11px] text-text-tertiary ml-1">
            {format === "flac" ? "44.1 kHz / 16-bit" : "320 kbps"}
          </span>
        </div>

        {/* Extract button */}
        <button
          onClick={startExtract}
          disabled={!canExtract}
          className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          {chapters.length > 0 ? `Extract ${chapters.length} Tracks` : "Extract Audio"}
        </button>

        {error && <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger">{error}</div>}
      </div>
    </div>
  );
};
