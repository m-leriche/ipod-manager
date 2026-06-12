import type { ConvertTarget } from "./types";

export const CONVERT_TARGETS: ConvertTarget[] = [
  { label: "FLAC 16-bit / 44.1 kHz (CD)", target_format: "flac", sample_rate: 44100, bit_depth: 16, mp3_bitrate: null },
  { label: "FLAC 16-bit / 48 kHz", target_format: "flac", sample_rate: 48000, bit_depth: 16, mp3_bitrate: null },
  { label: "FLAC 24-bit / 48 kHz", target_format: "flac", sample_rate: 48000, bit_depth: 24, mp3_bitrate: null },
  { label: "FLAC 24-bit / 96 kHz", target_format: "flac", sample_rate: 96000, bit_depth: 24, mp3_bitrate: null },
  { label: "MP3 320 kbps", target_format: "mp3", sample_rate: null, bit_depth: null, mp3_bitrate: 320 },
  { label: "MP3 128 kbps", target_format: "mp3", sample_rate: null, bit_depth: null, mp3_bitrate: 128 },
];
