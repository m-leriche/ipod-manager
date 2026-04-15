import { useEffect } from "react";
import { WaveformCanvas } from "../../atoms/WaveformCanvas/WaveformCanvas";
import { formatPlaybackTime } from "../../molecules/MiniPlayer/helpers";
import type { AudioPlaybackState } from "../../molecules/MiniPlayer/types";
import type { AudioFileInfo, WaveformResult } from "../../../types/quality";
import { formatBitrate, formatSampleRate, formatBitDepth, formatDuration, verdictColor } from "./helpers";

interface AudioPreviewModalProps {
  type: "spectrogram" | "waveform";
  file: AudioFileInfo;
  spectrogramBase64?: string;
  waveformResult?: WaveformResult;
  audio?: AudioPlaybackState;
  onClose: () => void;
}

const StatRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-border-subtle">
    <span className="text-[11px] text-text-tertiary">{label}</span>
    <span className="text-[11px] font-medium text-text-secondary">{value}</span>
  </div>
);

export const AudioPreviewModal = ({
  type,
  file,
  spectrogramBase64,
  waveformResult,
  audio,
  onClose,
}: AudioPreviewModalProps) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="preview-backdrop" />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[90vw] max-w-[1100px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-medium text-text-primary truncate">{file.file_name}</h2>
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider shrink-0">
              {type === "spectrogram" ? "Spectrogram" : "Waveform"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none ml-3"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Visualization */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto min-w-0">
            {type === "spectrogram" && spectrogramBase64 && (
              <img
                src={`data:image/png;base64,${spectrogramBase64}`}
                alt="Audio spectrogram"
                className="w-full max-w-full rounded-lg border border-border"
              />
            )}
            {type === "waveform" && waveformResult && audio && (
              <div className="w-full">
                <WaveformCanvas
                  peaks={waveformResult.peaks}
                  width={800}
                  height={200}
                  playbackFraction={audio.playbackFraction}
                  onClick={audio.seekTo}
                  className="w-full"
                />
                {/* Transport controls */}
                <div className="flex items-center gap-3 mt-4 justify-center">
                  <button
                    onClick={audio.isPlaying ? audio.pause : audio.play}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
                    aria-label={audio.isPlaying ? "Pause" : "Play"}
                  >
                    {audio.isPlaying ? "⏸" : "▶"}
                  </button>
                  <button
                    onClick={audio.stop}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-tertiary hover:text-text-secondary hover:border-border-active transition-colors"
                    aria-label="Stop"
                  >
                    ⏹
                  </button>
                  <span className="text-xs text-text-tertiary tabular-nums">
                    {formatPlaybackTime(audio.currentTime)} / {formatPlaybackTime(waveformResult.duration)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Stats sidebar */}
          <div className="w-56 shrink-0 border-l border-border p-4 overflow-y-auto">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-3">
              File Details
            </span>
            <StatRow label="Codec" value={file.codec.toUpperCase()} />
            <StatRow label="Sample Rate" value={formatSampleRate(file.sample_rate)} />
            <StatRow label="Bit Depth" value={formatBitDepth(file.bit_depth)} />
            <StatRow label="Bitrate" value={formatBitrate(file.bitrate)} />
            <StatRow
              label="Channels"
              value={file.channels === 2 ? "Stereo" : file.channels === 1 ? "Mono" : `${file.channels}ch`}
            />
            <StatRow label="Duration" value={formatDuration(file.duration)} />

            <div className="mt-4 px-3 py-2.5 bg-bg-card border border-border rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Verdict</span>
                <span className={`text-[11px] font-medium ${verdictColor(file.verdict)}`}>
                  {file.verdict === "lossless"
                    ? "Lossless"
                    : file.verdict === "suspect"
                      ? "Suspect Transcode"
                      : "Lossy"}
                </span>
              </div>
              <p className="text-[11px] text-text-tertiary leading-relaxed">{file.verdict_reason}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
