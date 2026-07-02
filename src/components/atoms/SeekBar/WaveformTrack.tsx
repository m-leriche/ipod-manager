import { useRef, useEffect, useState } from "react";
import { drawWaveform } from "../WaveformCanvas/helpers";
import { resolveWaveformColors } from "./helpers";

interface WaveformTrackProps {
  peaks: [number, number][];
  fraction: number;
}

export const WaveformTrack = ({ peaks, fraction }: WaveformTrackProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;

    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    drawWaveform(ctx, peaks, width, height, fraction, resolveWaveformColors(canvas));
  }, [peaks, width, fraction]);

  return <canvas ref={canvasRef} className="w-full h-full" data-testid="waveform-seek-track" />;
};
