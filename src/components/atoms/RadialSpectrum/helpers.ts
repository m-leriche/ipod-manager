const TWO_PI = 2 * Math.PI;

/** Decay rate per second — a full bar falls to zero in ~0.5s. */
const DECAY_RATE = 2.0;

/**
 * Apply smooth decay to spectrum bands.
 * Instant attack (snap up), smooth exponential fall.
 */
export const applyDecay = (current: number[], target: number[], dt: number): void => {
  const decay = DECAY_RATE * dt;
  for (let i = 0; i < current.length; i++) {
    const t = target[i] ?? 0;
    current[i] = t > current[i] ? t : Math.max(t, current[i] - decay);
  }
};

/** Map a 0-1 band index to an HSL color (blue → purple → cyan). */
const bandColor = (fraction: number): string => {
  // 210 (blue) → 270 (purple) → 190 (cyan), wrapping through high hues
  const hue = 210 + fraction * 160;
  return `hsl(${hue % 360}, 90%, 60%)`;
};

/**
 * Draw a radial frequency spectrum on a canvas.
 * Mirrored bands (left=right) for visual symmetry.
 * Two-pass rendering: blurred glow layer + sharp foreground.
 *
 * @param artRadius — half the album art size. Bars start just outside this.
 */
export const drawRadialSpectrum = (
  ctx: CanvasRenderingContext2D,
  bands: number[],
  width: number,
  height: number,
  artRadius: number,
  _color: string,
): void => {
  const centerX = width / 2;
  const centerY = height / 2;
  const gap = Math.max(3, artRadius * 0.02);
  const innerRadius = artRadius + gap;
  const maxBarHeight = Math.max(20, artRadius * 0.55);
  const numBars = bands.length;
  // Mirror: draw each band on both sides for symmetry (64 visual bars from 32 data points)
  const totalBars = numBars * 2;
  const barWidth = ((TWO_PI * innerRadius) / totalBars) * 0.6;

  ctx.clearRect(0, 0, width, height);

  // Two passes: glow underneath, then crisp bars on top
  for (let pass = 0; pass < 2; pass++) {
    ctx.save();
    if (pass === 0) {
      ctx.shadowBlur = 24;
      ctx.globalAlpha = 0.5;
    }
    ctx.lineCap = "round";

    for (let i = 0; i < totalBars; i++) {
      // Mirror: right side 0..31 (bass→treble bottom→top), left side 31..0
      const dataIdx = i < numBars ? i : totalBars - 1 - i;
      const mag = bands[dataIdx];

      // Start at 6 o'clock (+PI/2) so bass fans out from bottom, treble meets at top
      const angle = (i / totalBars) * TWO_PI + Math.PI / 2;
      const barHeight = Math.max(2, mag * maxBarHeight);
      const color = bandColor(dataIdx / numBars);

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x1 = centerX + innerRadius * cos;
      const y1 = centerY + innerRadius * sin;
      const x2 = centerX + (innerRadius + barHeight) * cos;
      const y2 = centerY + (innerRadius + barHeight) * sin;

      if (pass === 0) {
        ctx.shadowColor = color;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = barWidth;
      if (pass === 1) {
        ctx.globalAlpha = 0.5 + mag * 0.5;
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }
};
