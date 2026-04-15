export interface AudioFileInfo {
  file_path: string;
  file_name: string;
  codec: string;
  sample_rate: number;
  bit_depth: number | null;
  bitrate: number | null;
  channels: number;
  duration: number;
  is_lossless_container: boolean;
  verdict: "lossless" | "lossy" | "suspect";
  verdict_reason: string;
}

export interface QualityScanProgress {
  total: number;
  completed: number;
  current_file: string;
}

export interface SpectrogramResult {
  file_path: string;
  image_base64: string;
}

export interface WaveformResult {
  file_path: string;
  peaks: [number, number][];
  duration: number;
}
