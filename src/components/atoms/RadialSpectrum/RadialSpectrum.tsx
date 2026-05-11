import { useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { applyDecay, drawRadialSpectrum } from "./helpers";
import type { RadialSpectrumProps } from "./types";

const NUM_BANDS = 32;
const ACCENT = "#0066ff";

/** Extra canvas px per side so bars can radiate beyond the container. */
const bleed = (size: number) => Math.max(16, Math.ceil(size * 0.22));

export const RadialSpectrum = ({ size, children, className = "" }: RadialSpectrumProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<number[]>(new Array(NUM_BANDS).fill(0));
  const currentRef = useRef<number[]>(new Array(NUM_BANDS).fill(0));
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const activeRef = useRef(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const now = performance.now();
      const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = now;

      applyDecay(currentRef.current, targetRef.current, dt);

      const s = sizeRef.current;
      const b = bleed(s);
      const canvasSize = s + b * 2;
      const dpr = window.devicePixelRatio || 1;
      const w = canvasSize * dpr;
      const h = canvasSize * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const artRadius = s / 2;
      drawRadialSpectrum(ctx, currentRef.current, canvasSize, canvasSize, artRadius, ACCENT);

      const hasActivity = currentRef.current.some((v) => v > 0.005);
      if (hasActivity) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        activeRef.current = false;
      }
    };

    const startLoop = () => {
      if (!activeRef.current) {
        activeRef.current = true;
        lastTimeRef.current = 0;
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    listen<number[]>("audio:spectrum", (event) => {
      targetRef.current = event.payload;
      startLoop();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      mounted = false;
      unlisten?.();
      cancelAnimationFrame(rafRef.current);
      activeRef.current = false;
    };
  }, []);

  const b = bleed(size);
  const canvasSize = size + b * 2;

  return (
    <div className={`relative shrink-0 overflow-visible ${className}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      <canvas
        ref={canvasRef}
        className="absolute pointer-events-none z-10"
        style={{
          width: canvasSize,
          height: canvasSize,
          left: -b,
          top: -b,
        }}
      />
    </div>
  );
};
