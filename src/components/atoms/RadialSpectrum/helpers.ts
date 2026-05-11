const TWO_PI = 2 * Math.PI;

/** Decay rate per second — a full bar falls to zero in ~0.4s. */
const DECAY_RATE = 2.5;

/**
 * Apply smooth decay to spectrum bands.
 * Instant attack (snap up), exponential fall.
 */
export const applyDecay = (current: number[], target: number[], dt: number): void => {
  const decay = DECAY_RATE * dt;
  for (let i = 0; i < current.length; i++) {
    const t = target[i] ?? 0;
    current[i] = t > current[i] ? t : Math.max(t, current[i] - decay);
  }
};

/**
 * Draw a radial frequency spectrum on a canvas.
 * Bars radiate outward from a central circle.
 *
 * @param artRadius — half the album art size. Bars start just outside this.
 */
export const drawRadialSpectrum = (
  ctx: CanvasRenderingContext2D,
  bands: number[],
  width: number,
  height: number,
  artRadius: number,
  color: string,
): void => {
  const centerX = width / 2;
  const centerY = height / 2;
  const innerRadius = artRadius + 2;
  const maxBarHeight = Math.max(12, artRadius * 0.14);
  const numBars = bands.length;
  const barWidth = ((TWO_PI * innerRadius) / numBars) * 0.5;

  ctx.clearRect(0, 0, width, height);
  ctx.save();

  ctx.shadowBlur = 12;
  ctx.shadowColor = color;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;

  for (let i = 0; i < numBars; i++) {
    const angle = (i / numBars) * TWO_PI - Math.PI / 2;
    const mag = bands[i];
    const barHeight = Math.max(2, mag * maxBarHeight);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x1 = centerX + innerRadius * cos;
    const y1 = centerY + innerRadius * sin;
    const x2 = centerX + (innerRadius + barHeight) * cos;
    const y2 = centerY + (innerRadius + barHeight) * sin;

    ctx.lineWidth = barWidth;
    ctx.globalAlpha = 0.35 + mag * 0.65;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
};
