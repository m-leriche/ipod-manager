import type { ParametricBand } from "./types";
import { formatFrequency, GAIN_MIN, GAIN_MAX } from "./constants";

interface ParametricBandListProps {
  bands: ParametricBand[];
  preamp: number;
  disabled?: boolean;
  onBandGainChange: (index: number, gain: number) => void;
  onPreampChange: (preamp: number) => void;
}

const TYPE_LABELS: Record<string, string> = {
  lowshelf: "Low Shelf",
  highshelf: "High Shelf",
  peaking: "Peak",
};

const clampGain = (v: number) => Math.round(Math.max(GAIN_MIN, Math.min(GAIN_MAX, v)) * 10) / 10;

export const ParametricBandList = ({
  bands,
  preamp,
  disabled,
  onBandGainChange,
  onPreampChange,
}: ParametricBandListProps) => (
  <div className={`px-4 pt-2 pb-3 ${disabled ? "opacity-40" : ""}`}>
    <table className="w-full text-[10px]">
      <thead>
        <tr className="text-text-tertiary text-left">
          <th className="font-medium pb-1.5 pr-3">#</th>
          <th className="font-medium pb-1.5 pr-3">Type</th>
          <th className="font-medium pb-1.5 pr-3 text-right">Freq</th>
          <th className="font-medium pb-1.5 pr-3 text-right">Gain</th>
          <th className="font-medium pb-1.5 text-right">Q</th>
        </tr>
      </thead>
      <tbody className="text-text-secondary">
        {/* Preamp row */}
        <tr className="border-b border-border/50">
          <td className="py-1 pr-3 text-text-tertiary">Pre</td>
          <td className="py-1 pr-3 text-text-tertiary">Gain</td>
          <td className="py-1 pr-3 text-right">—</td>
          <td className="py-1 pr-3 text-right">
            <GainInput value={preamp} onChange={(v) => onPreampChange(v)} disabled={disabled} />
          </td>
          <td className="py-1 text-right">—</td>
        </tr>

        {bands.map((band, i) => (
          <tr key={i} className={i < bands.length - 1 ? "border-b border-border/30" : ""}>
            <td className="py-1 pr-3 text-text-tertiary">{i + 1}</td>
            <td className="py-1 pr-3">{TYPE_LABELS[band.type] ?? band.type}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatFrequency(band.frequency)} Hz</td>
            <td className="py-1 pr-3 text-right">
              <GainInput value={band.gain} onChange={(v) => onBandGainChange(i, v)} disabled={disabled} />
            </td>
            <td className="py-1 text-right tabular-nums">{band.q.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const GainInput = ({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) => (
  <input
    type="number"
    value={value.toFixed(1)}
    onChange={(e) => {
      const v = parseFloat(e.target.value);
      if (isFinite(v)) onChange(clampGain(v));
    }}
    step={0.5}
    min={GAIN_MIN}
    max={GAIN_MAX}
    disabled={disabled}
    className={`w-16 text-right tabular-nums bg-transparent border border-transparent rounded px-1 py-0.5
      hover:border-border focus:border-accent/50 focus:outline-none
      disabled:pointer-events-none
      ${value > 0 ? "text-success" : value < 0 ? "text-warning" : ""}`}
  />
);
