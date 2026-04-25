import type { ParametricBand } from "./types";
import { formatFrequency } from "./constants";

interface ParametricBandListProps {
  bands: ParametricBand[];
  preamp: number;
  disabled?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  lowshelf: "Low Shelf",
  highshelf: "High Shelf",
  peaking: "Peak",
};

export const ParametricBandList = ({ bands, preamp, disabled }: ParametricBandListProps) => (
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
          <td
            className={`py-1 pr-3 text-right tabular-nums ${preamp > 0 ? "text-success" : preamp < 0 ? "text-warning" : ""}`}
          >
            {preamp > 0 ? "+" : ""}
            {preamp.toFixed(1)} dB
          </td>
          <td className="py-1 text-right">—</td>
        </tr>

        {bands.map((band, i) => (
          <tr key={i} className={i < bands.length - 1 ? "border-b border-border/30" : ""}>
            <td className="py-1 pr-3 text-text-tertiary">{i + 1}</td>
            <td className="py-1 pr-3">{TYPE_LABELS[band.type] ?? band.type}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatFrequency(band.frequency)} Hz</td>
            <td
              className={`py-1 pr-3 text-right tabular-nums ${band.gain > 0 ? "text-success" : band.gain < 0 ? "text-warning" : ""}`}
            >
              {band.gain > 0 ? "+" : ""}
              {band.gain.toFixed(1)} dB
            </td>
            <td className="py-1 text-right tabular-nums">{band.q.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
