import { useRef, useEffect } from "react";
import { useEqualizer } from "../../../contexts/EqualizerContext";
import { BandSlider } from "./BandSlider";
import { PresetDropdown } from "./PresetDropdown";
import { FREQUENCIES_10, FREQUENCIES_31, formatFrequency, GAIN_MIN, GAIN_MAX } from "./constants";

export const EqualizerPanel = () => {
  const { state, isOpen, setIsOpen, setEnabled, setBandMode, setGain, setParametricBandGain, setPreamp, resetGains } =
    useEqualizer();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-eq-toggle]")) return;
        setIsOpen(false);
      }
    };
    const timer = setTimeout(() => window.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen, setIsOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, setIsOpen]);

  if (!isOpen) return null;

  const isParametric = state.parametricBands !== null;
  const frequencies = state.bandMode === "10" ? FREQUENCIES_10 : FREQUENCIES_31;
  const gains = state.bandMode === "10" ? state.gains10 : state.gains31;
  const narrow = state.bandMode === "31";

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bottom-[108px] left-4 bg-bg-secondary border border-border rounded-xl shadow-2xl animate-fade-in"
      style={{ maxWidth: "calc(100vw - 32px)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <span className="text-xs font-medium text-text-primary">Equalizer</span>

        {/* Enable toggle */}
        <button
          onClick={() => setEnabled(!state.enabled)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            state.enabled
              ? "bg-accent/20 text-accent border border-accent/30"
              : "bg-bg-card text-text-tertiary border border-border hover:text-text-secondary"
          }`}
        >
          {state.enabled ? "ON" : "OFF"}
        </button>

        <PresetDropdown />

        <div className="flex-1" />

        {/* Band mode toggle — only for graphic EQ */}
        {!isParametric && (
          <div className="flex rounded-md overflow-hidden border border-border">
            <ModeButton active={state.bandMode === "10"} onClick={() => setBandMode("10")}>
              10 Band
            </ModeButton>
            <ModeButton active={state.bandMode === "31"} onClick={() => setBandMode("31")}>
              31 Band
            </ModeButton>
          </div>
        )}

        {/* Parametric label */}
        {isParametric && <span className="text-[10px] text-text-tertiary">Parametric EQ</span>}

        {/* Reset */}
        <button
          onClick={resetGains}
          className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
          title="Reset all bands to 0dB"
        >
          Reset
        </button>

        {/* Close */}
        <button
          onClick={() => setIsOpen(false)}
          className="text-text-tertiary hover:text-text-primary transition-colors ml-1"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* EQ sliders — shared layout for both graphic and parametric modes */}
      <div className={`px-4 pt-3 pb-4 flex ${!isParametric && narrow ? "gap-0" : "gap-2"}`}>
        {/* dB scale */}
        <div className="flex flex-col justify-between items-end pr-2 pt-4" style={{ height: 120 + 16 + 12 }}>
          <span className="text-[8px] text-text-tertiary">+{GAIN_MAX}</span>
          <span className="text-[8px] text-text-tertiary">0</span>
          <span className="text-[8px] text-text-tertiary">{GAIN_MIN}</span>
        </div>

        {/* Preamp */}
        <div className="border-r border-border pr-2 mr-1">
          <BandSlider label="Pre" value={state.preamp} onChange={setPreamp} disabled={!state.enabled} />
        </div>

        {/* Parametric band sliders */}
        {isParametric &&
          state.parametricBands!.map((band, i) => (
            <BandSlider
              key={`param-${i}-${band.frequency}`}
              label={formatFrequency(band.frequency)}
              value={band.gain}
              onChange={(v) => setParametricBandGain(i, v)}
              disabled={!state.enabled}
            />
          ))}

        {/* Graphic band sliders */}
        {!isParametric &&
          frequencies.map((freq, i) => (
            <BandSlider
              key={`${state.bandMode}-${freq}`}
              label={formatFrequency(freq)}
              value={gains[i] ?? 0}
              onChange={(v) => setGain(i, v)}
              disabled={!state.enabled}
              narrow={narrow}
            />
          ))}
      </div>
    </div>
  );
};

const ModeButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
      active ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
    }`}
  >
    {children}
  </button>
);
