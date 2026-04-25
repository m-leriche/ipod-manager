export type BandMode = "10" | "31";
export type FilterType = "peaking" | "lowshelf" | "highshelf";

export interface EqualizerState {
  enabled: boolean;
  bandMode: BandMode;
  gains10: number[];
  gains31: number[];
  preamp: number;
  activePreset: string | null; // null = Manual
  parametricBands: ParametricBand[] | null; // non-null when a parametric preset is active
}

export interface EqPreset {
  name: string;
  gains: number[];
  preamp: number;
  builtIn?: boolean;
}

export interface ParametricBand {
  type: FilterType;
  frequency: number;
  gain: number;
  q: number;
}

export interface ParametricPreset {
  name: string;
  bands: ParametricBand[];
  preamp: number;
  source?: string;
}
