export type { AudioFileInfo, QualityScanProgress, SpectrogramResult } from "../../../types/quality";

import type { AudioFileInfo } from "../../../types/quality";

export type Phase = "idle" | "scanning" | "scanned";

export interface VerdictGroup {
  verdict: "suspect" | "lossy" | "lossless";
  label: string;
  files: AudioFileInfo[];
}
