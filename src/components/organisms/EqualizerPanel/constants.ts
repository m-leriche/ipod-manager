import type { EqPreset, ParametricPreset } from "./types";

export const FREQUENCIES_10 = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const FREQUENCIES_31 = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150,
  4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
];

// Q factor for 1-octave bandwidth (10-band graphic EQ)
export const Q_10 = 1.414;

// Q factor for 1/3-octave bandwidth (31-band graphic EQ)
export const Q_31 = 4.318;

export const GAIN_MIN = -12;
export const GAIN_MAX = 12;

export const formatFrequency = (freq: number): string => {
  if (freq >= 1000) {
    const k = freq / 1000;
    return k % 1 === 0 ? `${k}k` : `${k}k`;
  }
  return String(freq);
};

// ── Built-in presets (10-band: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k) ──

export const BUILT_IN_PRESETS: EqPreset[] = [
  { name: "Acoustic", gains: [5, 5, 4, 1, 2, 2, 4, 4, 3.5, 2], preamp: -3, builtIn: true },
  { name: "Bass Booster", gains: [5.5, 4.5, 3.5, 2, 1, 0, 0, 0, 0, 0], preamp: -3, builtIn: true },
  { name: "Bass Reducer", gains: [-5.5, -4.5, -3.5, -2, -1, 0, 0, 0, 0, 0], preamp: 0, builtIn: true },
  { name: "Classical", gains: [5, 3.5, 3, 2.5, -1.5, -1.5, 0, 2, 3, 3.5], preamp: -3, builtIn: true },
  { name: "Dance", gains: [4, 7, 5, 0, 2, 3.5, 5.5, 4.5, 3.5, 0], preamp: -4, builtIn: true },
  { name: "Deep", gains: [5, 3.5, 2, 1, 3, 2.5, 1.5, -2, -4, -5], preamp: -3, builtIn: true },
  { name: "Electronic", gains: [4.5, 4, 1.5, 0, -2, 2, 1, 1.5, 4, 5], preamp: -3, builtIn: true },
  { name: "Hip-Hop", gains: [5, 4.5, 1.5, 3, -1, -1, 1.5, -0.5, 2, 3], preamp: -3, builtIn: true },
  { name: "Jazz", gains: [4, 3, 1.5, 2, -1.5, -1.5, 0, 1.5, 3, 3.5], preamp: -3, builtIn: true },
  { name: "Latin", gains: [4.5, 3, 0, 0, -1.5, -1.5, -1.5, 0, 3, 5.5], preamp: -3, builtIn: true },
  { name: "Lounge", gains: [-3, -1.5, -0.5, 1.5, 4, 2.5, 0, -1.5, 2, 1], preamp: -2, builtIn: true },
  { name: "Loudness", gains: [6, 4, 0, 0, -2, 0, -1, -5, 5, 1], preamp: -3, builtIn: true },
  { name: "Piano", gains: [3, 2, 0, 2.5, 3, 1.5, 3.5, 4.5, 3, 3.5], preamp: -3, builtIn: true },
  { name: "Pop", gains: [-1.5, 4.5, 7, 8, 5.5, 0, -2.5, -2.5, -1.5, -1.5], preamp: -4, builtIn: true },
  { name: "R&B", gains: [7, 7, 5.5, 1.5, -3, -1.5, 2.5, 3, 3, 4], preamp: -4, builtIn: true },
  { name: "Rock", gains: [5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5], preamp: -3, builtIn: true },
  { name: "Small Speakers", gains: [5.5, 4.5, 3.5, 2.5, 1.5, 0.5, -0.5, -1, -1.5, -2], preamp: -3, builtIn: true },
  { name: "Spoken Word", gains: [-3.5, -0.5, 0, 0.5, 3.5, 5, 5, 4.5, 2.5, 0], preamp: -3, builtIn: true },
  { name: "Treble Booster", gains: [0, 0, 0, 0, 0, 1, 2.5, 4, 4.5, 5.5], preamp: -3, builtIn: true },
  { name: "Treble Reducer", gains: [0, 0, 0, 0, 0, -1, -2.5, -4, -4.5, -5.5], preamp: 0, builtIn: true },
  { name: "Vocal Booster", gains: [-1.5, -3, -3, 1.5, 3.5, 3.5, 3, 1.5, 0, -1.5], preamp: -2, builtIn: true },
];

// ── Parametric presets (oratory1990 headphone profiles) ──────────

export const PARAMETRIC_PRESETS: ParametricPreset[] = [
  {
    name: "Sennheiser HD660S2",
    source: "oratory1990",
    preamp: -9.6,
    bands: [
      { type: "lowshelf", frequency: 28, gain: 4.0, q: 0.8 },
      { type: "lowshelf", frequency: 100, gain: 5.5, q: 0.71 },
      { type: "peaking", frequency: 180, gain: -1.8, q: 1.0 },
      { type: "peaking", frequency: 1250, gain: -2.4, q: 1.4 },
      { type: "highshelf", frequency: 3000, gain: 6.0, q: 0.35 },
      { type: "peaking", frequency: 3150, gain: -1.5, q: 3.0 },
      { type: "peaking", frequency: 5600, gain: -7.0, q: 3.5 },
      { type: "peaking", frequency: 6500, gain: 2.0, q: 1.4 },
      { type: "highshelf", frequency: 10000, gain: -4.0, q: 1.0 },
    ],
  },
];
