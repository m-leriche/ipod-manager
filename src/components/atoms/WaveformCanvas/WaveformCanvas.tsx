import { useRef, useEffect, useCallback, useMemo } from "react";
import type { WaveformCanvasProps } from "./types";
import { drawWaveform, fractionFromClick, DEFAULT_COLORS } from "./helpers";

export const WaveformCanvas = ({
  peaks,
  width,
  height,
  playbackFraction = 0,
  onClick,
  accentColor,
  baseColor,
  className = "",
}: WaveformCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const colors = useMemo(
    () => ({
      played: accentColor ?? DEFAULT_COLORS.played,
      unplayed: baseColor ?? DEFAULT_COLORS.unplayed,
      cursor: DEFAULT_COLORS.cursor,
    }),
    [accentColor, baseColor],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    drawWaveform(ctx, peaks, width, height, playbackFraction, colors);
  }, [peaks, width, height, playbackFraction, colors]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onClick || !canvasRef.current) return;
      onClick(fractionFromClick(e, canvasRef.current));
    },
    [onClick],
  );

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={`rounded ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={handleClick}
      data-testid="waveform-canvas"
    />
  );
};
