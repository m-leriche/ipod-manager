import type { WaveformColors } from "../WaveformCanvas/types";

export const resolveWaveformColors = (element: HTMLElement): WaveformColors => {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const played = read("--color-accent", "#0066ff");
  return {
    played,
    unplayed: read("--color-text-tertiary", "#555555"),
    cursor: played,
  };
};
