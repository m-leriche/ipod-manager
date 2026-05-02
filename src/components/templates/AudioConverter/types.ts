export interface AudioProbeInfo {
  file_path: string;
  file_name: string;
  codec: string;
  sample_rate: number;
  bit_depth: number | null;
  bitrate_kbps: number | null;
  duration: number;
  channels: number;
  is_lossless: boolean;
}

export interface ConvertRequest {
  input_path: string;
  output_dir: string;
  target_format: string;
  mp3_bitrate: number | null;
  flac_sample_rate: number | null;
  flac_bit_depth: number | null;
}

export interface ConvertProgress {
  file_index: number;
  total_files: number;
  current_file: string;
  percent: number;
  phase: string;
}

export interface ConvertResult {
  success: boolean;
  cancelled: boolean;
  converted: number;
  failed: number;
  errors: string[];
  output_paths: string[];
  warnings: string[];
}

export type TargetFormat = "flac" | "mp3";

export type FlacPreset = "original" | "16/44.1" | "16/48" | "24/44.1" | "24/48" | "24/96" | "24/192";

export interface FlacPresetConfig {
  label: string;
  sample_rate: number | null;
  bit_depth: number | null;
}
