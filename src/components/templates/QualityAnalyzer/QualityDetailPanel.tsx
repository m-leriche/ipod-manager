import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Spinner } from "../../atoms/Spinner/Spinner";
import type { AudioFileInfo, SpectrogramResult } from "../../../types/quality";
import { formatBitrate, formatSampleRate, formatBitDepth, formatDuration, verdictColor } from "./helpers";

interface QualityDetailPanelProps {
  file: AudioFileInfo;
  spectrogramCache: Record<string, string>;
  onSpectrogramLoaded: (filePath: string, base64: string) => void;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-border-subtle">
    <span className="text-[11px] text-text-tertiary">{label}</span>
    <span className="text-[11px] font-medium text-text-secondary">{value}</span>
  </div>
);

export const QualityDetailPanel = ({ file, spectrogramCache, onSpectrogramLoaded }: QualityDetailPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cachedSpectrogram = spectrogramCache[file.file_path];

  const generateSpectrogram = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SpectrogramResult>("generate_spectrogram", {
        filePath: file.file_path,
      });
      onSpectrogramLoaded(file.file_path, result.image_base64);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-96 shrink-0 bg-bg-secondary border border-border rounded-2xl flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <p className="text-xs font-medium text-text-primary truncate">{file.file_name}</p>
      </div>

      {/* Properties + spectrogram */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Properties grid */}
        <div className="mb-4">
          <Row label="Codec" value={file.codec.toUpperCase()} />
          <Row label="Sample Rate" value={formatSampleRate(file.sample_rate)} />
          <Row label="Bit Depth" value={formatBitDepth(file.bit_depth)} />
          <Row label="Bitrate" value={formatBitrate(file.bitrate)} />
          <Row
            label="Channels"
            value={file.channels === 2 ? "Stereo" : file.channels === 1 ? "Mono" : `${file.channels}ch`}
          />
          <Row label="Duration" value={formatDuration(file.duration)} />
        </div>

        {/* Verdict */}
        <div className="mb-4 px-3 py-2.5 bg-bg-card border border-border rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Verdict</span>
            <span className={`text-[11px] font-medium ${verdictColor(file.verdict)}`}>
              {file.verdict === "lossless" ? "Lossless" : file.verdict === "suspect" ? "Suspect Transcode" : "Lossy"}
            </span>
          </div>
          <p className="text-[11px] text-text-tertiary leading-relaxed">{file.verdict_reason}</p>
        </div>

        {/* Spectrogram */}
        <div>
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-2">
            Spectrogram
          </span>
          {cachedSpectrogram ? (
            <img
              src={`data:image/png;base64,${cachedSpectrogram}`}
              alt="Audio spectrogram"
              className="w-full rounded-lg border border-border"
            />
          ) : loading ? (
            <div className="py-6 text-center text-text-tertiary text-[11px]">
              <Spinner /> Generating...
            </div>
          ) : (
            <button
              onClick={generateSpectrogram}
              className="w-full py-3 bg-bg-card border border-border rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-active transition-all"
            >
              Generate Spectrogram
            </button>
          )}
          {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
};
