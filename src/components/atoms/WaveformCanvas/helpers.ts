import type { WaveformColors } from "./types";

export const DEFAULT_COLORS: WaveformColors = {
  played: "#0066FF",
  unplayed: "#555555",
  cursor: "#ffffff",
};

export const drawWaveform = (
  ctx: CanvasRenderingContext2D,
  peaks: [number, number][],
  width: number,
  height: number,
  playbackFraction: number,
  colors: WaveformColors,
) => {
  ctx.clearRect(0, 0, width, height);

  if (peaks.length === 0) return;

  const barWidth = width / peaks.length;
  const midY = height / 2;
  const cursorX = playbackFraction * width;

  for (let i = 0; i < peaks.length; i++) {
    const [min, max] = peaks[i];
    const x = i * barWidth;

    // Map [-1, 1] range to canvas height
    const topY = midY - max * midY;
    const bottomY = midY - min * midY;
    const barHeight = Math.max(bottomY - topY, 1);

    ctx.fillStyle = x < cursorX ? colors.played : colors.unplayed;
    ctx.fillRect(x, topY, Math.max(barWidth - 0.5, 1), barHeight);
  }

  // Draw playback cursor
  if (playbackFraction > 0 && playbackFraction < 1) {
    ctx.fillStyle = colors.cursor;
    ctx.fillRect(cursorX - 0.5, 0, 1, height);
  }
};

export const fractionFromClick = (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): number => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return Math.max(0, Math.min(1, x / rect.width));
};
