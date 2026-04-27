import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BandMode, EqualizerState, EqPreset } from "../components/organisms/EqualizerPanel/types";
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
  setParametricBandGain: (bandIndex: number, gain: number) => void;
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

/** Convert frontend EQ state to the Rust EqConfig format and send via invoke. */
const sendEqConfig = (state: EqualizerState) => {
  const bands = state.parametricBands
    ? state.parametricBands.map((b) => ({
        filter_type: b.type,
        frequency: b.frequency,
        gain_db: b.gain,
        q: b.q,
      }))
    : (state.bandMode === "10" ? FREQUENCIES_10 : FREQUENCIES_31).map((freq, i) => ({
        filter_type: "peaking",
        frequency: freq,
        gain_db: (state.bandMode === "10" ? state.gains10 : state.gains31)[i] ?? 0,
        q: state.bandMode === "10" ? Q_10 : Q_31,
      }));

  invoke("audio_set_eq", {
    config: { enabled: state.enabled, preamp_db: state.preamp, bands },
  }).catch(() => {
    /* engine may not be ready yet on first load */
  });
};

// ── Context ─────────────────────────────────────────────────────

const EqualizerContext = createContext<EqualizerContextValue | null>(null);

export const EqualizerProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<EqualizerState>(loadState);
  const [isOpen, setIsOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<EqPreset[]>(loadCustomPresets);

  // Ref that always points to latest state (used inside callbacks)
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Persist + send EQ config to Rust engine on every state change ──

  useEffect(() => {
    persist(state);
    sendEqConfig(state);
  }, [state]);

  // ── Public setters ────────────────────────────────────────────

  const setEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, enabled }));
  }, []);

  const setBandMode = useCallback((mode: BandMode) => {
    setState((prev) => {
      if (prev.bandMode === mode && !prev.parametricBands) return prev;
      return { ...prev, bandMode: mode, activePreset: null, parametricBands: null };
    });
  }, []);

  const setGain = useCallback((bandIndex: number, gain: number) => {
    setState((prev) => {
      const key = prev.bandMode === "10" ? "gains10" : "gains31";
      const newGains = [...prev[key]];
      newGains[bandIndex] = gain;
      return { ...prev, [key]: newGains, activePreset: null, parametricBands: null };
    });
  }, []);

  const setParametricBandGain = useCallback((bandIndex: number, gain: number) => {
    setState((prev) => {
      if (!prev.parametricBands) return prev;
      const newBands = prev.parametricBands.map((b, i) => (i === bandIndex ? { ...b, gain } : b));
      return { ...prev, parametricBands: newBands, activePreset: null };
    });
  }, []);

  const setPreamp = useCallback((preamp: number) => {
    setState((prev) => ({ ...prev, preamp, activePreset: null }));
  }, []);

  const resetGains = useCallback(() => {
    setState((prev) => ({
      ...prev,
      gains10: new Array(10).fill(0),
      gains31: new Array(31).fill(0),
      preamp: 0,
      activePreset: null,
      parametricBands: null,
    }));
  }, []);

  // ── Preset management ─────────────────────────────────────────

  const selectPreset = useCallback(
    (name: string | null) => {
      if (name === null) {
        setState((prev) => ({ ...prev, activePreset: null, parametricBands: null }));
        return;
      }

      // Check parametric presets first
      const parametric = PARAMETRIC_PRESETS.find((p) => p.name === name);
      if (parametric) {
        setState((prev) => ({
          ...prev,
          preamp: parametric.preamp,
          activePreset: name,
          parametricBands: parametric.bands,
        }));
        return;
      }

      // Check graphic presets
      const preset = BUILT_IN_PRESETS.find((p) => p.name === name) || customPresets.find((p) => p.name === name);
      if (!preset) return;

      setState((prev) => ({
        ...prev,
        bandMode: "10" as BandMode,
        gains10: [...preset.gains],
        preamp: preset.preamp,
        activePreset: name,
        parametricBands: null,
      }));
    },
    [customPresets],
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
      setParametricBandGain,
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
      setParametricBandGain,
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
