import type { FlacPreset, FlacPresetConfig } from "./types";

export const FLAC_PRESETS: Record<FlacPreset, FlacPresetConfig> = {
  original: { label: "Original", sample_rate: null, bit_depth: null },
  "16/44.1": { label: "16-bit / 44.1 kHz (CD)", sample_rate: 44100, bit_depth: 16 },
  "16/48": { label: "16-bit / 48 kHz", sample_rate: 48000, bit_depth: 16 },
  "24/44.1": { label: "24-bit / 44.1 kHz", sample_rate: 44100, bit_depth: 24 },
  "24/48": { label: "24-bit / 48 kHz", sample_rate: 48000, bit_depth: 24 },
  "24/96": { label: "24-bit / 96 kHz", sample_rate: 96000, bit_depth: 24 },
  "24/192": { label: "24-bit / 192 kHz", sample_rate: 192000, bit_depth: 24 },
};

export const formatDuration = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const formatFileInfo = (
  codec: string,
  sampleRate: number,
  bitDepth: number | null,
  bitrateKbps: number | null,
): string => {
  const parts = [codec.toUpperCase()];
  if (bitDepth) parts.push(`${bitDepth}-bit`);
  if (sampleRate) parts.push(`${(sampleRate / 1000).toFixed(1)} kHz`);
  if (bitrateKbps) parts.push(`${bitrateKbps} kbps`);
  return parts.join(" · ");
};
