import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { BandMode, EqualizerState, EqPreset, ParametricBand } from "../components/organisms/EqualizerPanel/types";
import {
  FREQUENCIES_10,
  FREQUENCIES_31,
  Q_10,
  Q_31,
  BUILT_IN_PRESETS,
  PARAMETRIC_PRESETS,
} from "../components/organisms/EqualizerPanel/constants";

// ── Types ───────────────────────────────────────────────────────

interface EqualizerContextValue {
  state: EqualizerState;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  setBandMode: (mode: BandMode) => void;
  setGain: (bandIndex: number, gain: number) => void;
  setPreamp: (preamp: number) => void;
  resetGains: () => void;
  customPresets: EqPreset[];
  selectPreset: (name: string | null) => void;
  savePreset: (name: string) => void;
  deletePreset: (name: string) => void;
}

// ── Persistence ─────────────────────────────────────────────────

const STORAGE_KEY = "crate-equalizer";
const PRESETS_KEY = "crate-equalizer-presets";

const loadState = (): EqualizerState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const p = JSON.parse(stored);
      return {
        enabled: p.enabled ?? false,
        bandMode: p.bandMode === "31" ? "31" : "10",
        gains10: Array.isArray(p.gains10) && p.gains10.length === 10 ? p.gains10 : new Array(10).fill(0),
        gains31: Array.isArray(p.gains31) && p.gains31.length === 31 ? p.gains31 : new Array(31).fill(0),
        preamp: typeof p.preamp === "number" ? p.preamp : 0,
        activePreset: p.activePreset ?? null,
        parametricBands: Array.isArray(p.parametricBands) ? p.parametricBands : null,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return {
    enabled: false,
    bandMode: "10",
    gains10: new Array(10).fill(0),
    gains31: new Array(31).fill(0),
    preamp: 0,
    activePreset: null,
    parametricBands: null,
  };
};

const loadCustomPresets = (): EqPreset[] => {
  try {
    const stored = localStorage.getItem(PRESETS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return [];
};

const persist = (state: EqualizerState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const persistPresets = (presets: EqPreset[]) => {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
};

// ── Helpers ─────────────────────────────────────────────────────

const dbToLinear = (db: number): number => Math.pow(10, db / 20);

const getFrequencies = (mode: BandMode) => (mode === "10" ? FREQUENCIES_10 : FREQUENCIES_31);
const getQ = (mode: BandMode) => (mode === "10" ? Q_10 : Q_31);
const getGains = (state: EqualizerState) => (state.bandMode === "10" ? state.gains10 : state.gains31);

// ── Context ─────────────────────────────────────────────────────

const EqualizerContext = createContext<EqualizerContextValue | null>(null);

export const EqualizerProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<EqualizerState>(loadState);
  const [isOpen, setIsOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<EqPreset[]>(loadCustomPresets);

  // TODO: EQ is currently non-functional. Audio playback moved from browser <audio> elements
  // to a native Rust engine (symphonia + cpal), so the Web Audio API chain below no longer
  // receives any audio signal. To restore EQ:
  // 1. Implement biquad filters in Rust (src-tauri/src/audio/equalizer.rs) using Audio EQ Cookbook formulas
  // 2. Apply filters to PCM samples in the audio engine between decode and ring buffer
  // 3. Add invoke("audio_set_eq", { config }) call here whenever EQ state changes
  // 4. Remove all Web Audio API code below (AudioContext, BiquadFilterNode, GainNode, etc.)
  // The UI and preset management still work — only the audio processing path is disconnected.

  // Web Audio API refs — currently unused, will be removed when Rust EQ is implemented
  const ctxRef = useRef<AudioContext | null>(null);
  const preampRef = useRef<GainNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const sourcesRef = useRef<Map<HTMLAudioElement, MediaElementAudioSourceNode>>(new Map());

  // Ref that always points to latest state
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Build graphic EQ filter chain ─────────────────────────────

  const buildGraphicChain = useCallback((ctx: AudioContext, mode: BandMode) => {
    filtersRef.current.forEach((f) => f.disconnect());
    preampRef.current?.disconnect();

    const s = stateRef.current;
    const freqs = getFrequencies(mode);
    const q = getQ(mode);
    const gains = mode === "10" ? s.gains10 : s.gains31;

    const preamp = ctx.createGain();
    preamp.gain.value = s.enabled ? dbToLinear(s.preamp) : 1;
    preampRef.current = preamp;

    const filters = freqs.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = "peaking";
      f.frequency.value = freq;
      f.Q.value = q;
      f.gain.value = s.enabled ? (gains[i] ?? 0) : 0;
      return f;
    });
    filtersRef.current = filters;

    preamp.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }
    filters[filters.length - 1].connect(ctx.destination);

    sourcesRef.current.forEach((src) => {
      src.disconnect();
      src.connect(preamp);
    });
  }, []);

  // ── Build parametric EQ filter chain ──────────────────────────

  const buildParametricChain = useCallback((ctx: AudioContext, bands: ParametricBand[], preampDb: number) => {
    filtersRef.current.forEach((f) => f.disconnect());
    preampRef.current?.disconnect();

    const s = stateRef.current;

    const preamp = ctx.createGain();
    preamp.gain.value = s.enabled ? dbToLinear(preampDb) : 1;
    preampRef.current = preamp;

    const filters = bands.map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.frequency;
      f.Q.value = band.q;
      f.gain.value = s.enabled ? band.gain : 0;
      return f;
    });
    filtersRef.current = filters;

    if (filters.length === 0) {
      preamp.connect(ctx.destination);
    } else {
      preamp.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(ctx.destination);
    }

    sourcesRef.current.forEach((src) => {
      src.disconnect();
      src.connect(preamp);
    });
  }, []);

  // ── Persist on every state change ─────────────────────────────

  useEffect(() => {
    persist(state);
  }, [state]);

  // ── Apply gains to existing filter nodes ──────────────────────

  const applyGains = useCallback((s: EqualizerState) => {
    if (s.parametricBands) {
      filtersRef.current.forEach((f, i) => {
        f.gain.value = s.enabled ? (s.parametricBands![i]?.gain ?? 0) : 0;
      });
    } else {
      const gains = getGains(s);
      filtersRef.current.forEach((f, i) => {
        f.gain.value = s.enabled ? (gains[i] ?? 0) : 0;
      });
    }
    if (preampRef.current) {
      preampRef.current.gain.value = s.enabled ? dbToLinear(s.preamp) : 1;
    }
  }, []);

  // ── Public setters ────────────────────────────────────────────

  const setEnabled = useCallback(
    (enabled: boolean) => {
      setState((prev) => {
        const next = { ...prev, enabled };
        setTimeout(() => applyGains(next), 0);
        return next;
      });
    },
    [applyGains],
  );

  const setBandMode = useCallback(
    (mode: BandMode) => {
      setState((prev) => {
        if (prev.bandMode === mode && !prev.parametricBands) return prev;
        const next = { ...prev, bandMode: mode, activePreset: null, parametricBands: null };
        if (ctxRef.current) {
          stateRef.current = next;
          buildGraphicChain(ctxRef.current, mode);
        }
        return next;
      });
    },
    [buildGraphicChain],
  );

  const setGain = useCallback((bandIndex: number, gain: number) => {
    setState((prev) => {
      const key = prev.bandMode === "10" ? "gains10" : "gains31";
      const newGains = [...prev[key]];
      newGains[bandIndex] = gain;
      const next = { ...prev, [key]: newGains, activePreset: null, parametricBands: null };

      const filter = filtersRef.current[bandIndex];
      if (filter && prev.enabled) {
        filter.gain.value = gain;
      }

      return next;
    });
  }, []);

  const setPreamp = useCallback((preamp: number) => {
    setState((prev) => {
      const next = { ...prev, preamp, activePreset: null };
      if (preampRef.current && prev.enabled) {
        preampRef.current.gain.value = dbToLinear(preamp);
      }
      return next;
    });
  }, []);

  const resetGains = useCallback(() => {
    setState((prev) => {
      const next: EqualizerState = {
        ...prev,
        gains10: new Array(10).fill(0),
        gains31: new Array(31).fill(0),
        preamp: 0,
        activePreset: null,
        parametricBands: null,
      };
      if (ctxRef.current && prev.parametricBands) {
        stateRef.current = next;
        buildGraphicChain(ctxRef.current, next.bandMode);
      } else {
        applyGains(next);
      }
      return next;
    });
  }, [applyGains, buildGraphicChain]);

  // ── Preset management ─────────────────────────────────────────

  const selectPreset = useCallback(
    (name: string | null) => {
      if (name === null) {
        setState((prev) => {
          const next = { ...prev, activePreset: null, parametricBands: null };
          if (ctxRef.current && prev.parametricBands) {
            stateRef.current = next;
            buildGraphicChain(ctxRef.current, next.bandMode);
          }
          return next;
        });
        return;
      }

      // Check parametric presets first
      const parametric = PARAMETRIC_PRESETS.find((p) => p.name === name);
      if (parametric) {
        setState((prev) => {
          const next: EqualizerState = {
            ...prev,
            preamp: parametric.preamp,
            activePreset: name,
            parametricBands: parametric.bands,
          };
          if (ctxRef.current) {
            stateRef.current = next;
            buildParametricChain(ctxRef.current, parametric.bands, parametric.preamp);
          }
          return next;
        });
        return;
      }

      // Check graphic presets
      const preset = BUILT_IN_PRESETS.find((p) => p.name === name) || customPresets.find((p) => p.name === name);
      if (!preset) return;

      setState((prev) => {
        const next: EqualizerState = {
          ...prev,
          bandMode: "10",
          gains10: [...preset.gains],
          preamp: preset.preamp,
          activePreset: name,
          parametricBands: null,
        };
        if (ctxRef.current) {
          stateRef.current = next;
          if (prev.bandMode !== "10" || prev.parametricBands) {
            buildGraphicChain(ctxRef.current, "10");
          } else {
            applyGains(next);
          }
        }
        return next;
      });
    },
    [customPresets, buildGraphicChain, buildParametricChain, applyGains],
  );

  const savePreset = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const gains = stateRef.current.bandMode === "10" ? [...stateRef.current.gains10] : [...stateRef.current.gains31];
    const newPreset: EqPreset = {
      name: trimmed,
      gains,
      preamp: stateRef.current.preamp,
    };

    setCustomPresets((prev) => {
      const exists = prev.findIndex((p) => p.name === trimmed);
      const next = exists >= 0 ? prev.map((p, i) => (i === exists ? newPreset : p)) : [...prev, newPreset];
      persistPresets(next);
      return next;
    });

    setState((prev) => ({ ...prev, activePreset: trimmed }));
  }, []);

  const deletePreset = useCallback((name: string) => {
    setCustomPresets((prev) => {
      const next = prev.filter((p) => p.name !== name);
      persistPresets(next);
      return next;
    });
    setState((prev) => (prev.activePreset === name ? { ...prev, activePreset: null } : prev));
  }, []);

  // ── Memoized context value ────────────────────────────────────

  const value = useMemo<EqualizerContextValue>(
    () => ({
      state,
      isOpen,
      setIsOpen,
      setEnabled,
      setBandMode,
      setGain,
      setPreamp,
      resetGains,
      customPresets,
      selectPreset,
      savePreset,
      deletePreset,
    }),
    [
      state,
      isOpen,
      setEnabled,
      setBandMode,
      setGain,
      setPreamp,
      resetGains,
      customPresets,
      selectPreset,
      savePreset,
      deletePreset,
    ],
  );

  return <EqualizerContext.Provider value={value}>{children}</EqualizerContext.Provider>;
};

export const useEqualizer = (): EqualizerContextValue => {
  const ctx = useContext(EqualizerContext);
  if (!ctx) throw new Error("useEqualizer must be used within EqualizerProvider");
  return ctx;
};
