import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GenreMapLayout, MapPoint, ViewTransform } from "./types";
import { MAX_ZOOM, MIN_ZOOM, PAN_FRICTION, ZOOM_SMOOTHING } from "./constants";
import { introProgress, pointPositionInto } from "./motion";
import { createSprites, createStarfield, drawFrame } from "./renderer";
import { buildHeatField, computeContours, createHeatCanvas } from "./heatfield";

interface GenreMapCanvasProps {
  layout: GenreMapLayout;
  onSelectTrack: (point: MapPoint) => void;
}

const DRAG_THRESHOLD_PX = 4;
const HOVER_RADIUS_PX = 8;
const HOVER_THROTTLE_MS = 40;

// Retina sharpness is wasted on glow sprites; capping the backing
// resolution nearly halves the per-frame fill cost on 2x displays.
const getDpr = () => Math.min(window.devicePixelRatio || 1, 1.5);

// Fit at 0.7 so the galaxy floats in empty space instead of filling the frame
const fitView = (width: number, height: number, extent: number): ViewTransform => ({
  scale: Math.max((Math.min(width, height) / (extent * 2)) * 0.7, MIN_ZOOM),
  offsetX: width / 2,
  offsetY: height / 2,
});

export const GenreMapCanvas = ({ layout, onSelectTrack }: GenreMapCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewTransform | null>(null);
  const zoomRef = useRef<{ target: number; anchorX: number; anchorY: number } | null>(null);
  const velocityRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const clockRef = useRef({ timeSec: 0, introElapsedMs: 0 });
  const hoveredRef = useRef<MapPoint | null>(null);
  const lastHoverTestRef = useRef(0);
  const [hovered, setHovered] = useState<{ point: MapPoint; screenX: number; screenY: number } | null>(null);

  const stars = useMemo(() => createStarfield(layout.extent), [layout]);
  const sprites = useMemo(() => createSprites(layout), [layout]);
  const heat = useMemo(() => buildHeatField(layout), [layout]);
  const heatCanvas = useMemo(() => createHeatCanvas(heat), [heat]);
  const contours = useMemo(() => computeContours(heat), [heat]);

  // Refit and restart the big-bang intro whenever a new layout arrives
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = getDpr();
      viewRef.current = fitView(canvas.width / dpr, canvas.height / dpr, layout.extent);
    } else {
      viewRef.current = null;
    }
    zoomRef.current = null;
    velocityRef.current = { x: 0, y: 0 };
  }, [layout]);

  // Keep the canvas backing store in sync with its container size
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = (width: number, height: number) => {
      const dpr = getDpr();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      if (!viewRef.current) viewRef.current = fitView(width, height, layout.extent);
    };

    resize(container.clientWidth, container.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [layout]);

  // The animation loop: eases zoom, applies pan momentum, draws every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let start: number | null = null;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (start === null) start = now;
      clockRef.current = { timeSec: (now - start) / 1000, introElapsedMs: now - start };

      const view = viewRef.current;
      const ctx = canvas.getContext("2d");
      if (!view || !ctx) return;

      const zoom = zoomRef.current;
      if (zoom && Math.abs(zoom.target - view.scale) > view.scale * 0.001) {
        const scale = view.scale + (zoom.target - view.scale) * ZOOM_SMOOTHING;
        const applied = scale / view.scale;
        view.offsetX = zoom.anchorX - (zoom.anchorX - view.offsetX) * applied;
        view.offsetY = zoom.anchorY - (zoom.anchorY - view.offsetY) * applied;
        view.scale = scale;
      }

      const velocity = velocityRef.current;
      if (!dragRef.current && (Math.abs(velocity.x) > 0.05 || Math.abs(velocity.y) > 0.05)) {
        view.offsetX += velocity.x;
        view.offsetY += velocity.y;
        velocity.x *= PAN_FRICTION;
        velocity.y *= PAN_FRICTION;
      }

      const dpr = getDpr();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame({
        ctx,
        width: canvas.width / dpr,
        height: canvas.height / dpr,
        view,
        layout,
        stars,
        glows: sprites,
        heat,
        heatCanvas,
        contours,
        timeSec: clockRef.current.timeSec,
        introElapsedMs: clockRef.current.introElapsedMs,
        hovered: hoveredRef.current,
      });
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [layout, stars, sprites, heat, heatCanvas, contours]);

  // Native wheel listener: React's synthetic wheel events are passive, so
  // preventDefault (needed to stop page scroll while zooming) requires this.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const view = viewRef.current;
      if (!view) return;
      const rect = canvas.getBoundingClientRect();
      const current = zoomRef.current?.target ?? view.scale;
      zoomRef.current = {
        target: Math.min(Math.max(current * Math.exp(-e.deltaY * 0.002), MIN_ZOOM), MAX_ZOOM),
        anchorX: e.clientX - rect.left,
        anchorY: e.clientY - rect.top,
      };
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const hitTest = useCallback(
    (cx: number, cy: number): MapPoint | null => {
      const view = viewRef.current;
      if (!view) return null;
      const { timeSec, introElapsedMs } = clockRef.current;
      const pos = { x: 0, y: 0 };
      let best: MapPoint | null = null;
      let bestDistSq = Infinity;
      for (const point of layout.points) {
        const intro = introProgress(point, introElapsedMs);
        if (intro === 0) continue;
        pointPositionInto(point, timeSec, intro, pos);
        const dx = pos.x * view.scale + view.offsetX - cx;
        const dy = pos.y * view.scale + view.offsetY - cy;
        const distSq = dx * dx + dy * dy;
        const hitRadius = Math.max(point.radius * view.scale, HOVER_RADIUS_PX);
        if (distSq <= hitRadius * hitRadius && distSq < bestDistSq) {
          best = point;
          bestDistSq = distSq;
        }
      }
      return best;
    },
    [layout],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    velocityRef.current = { x: 0, y: 0 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const view = viewRef.current;
        if (!view) return;
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX) drag.moved = true;
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        view.offsetX += dx;
        view.offsetY += dy;
        // Smoothed per-frame velocity so releasing the drag keeps gliding
        velocityRef.current = {
          x: velocityRef.current.x * 0.7 + dx * 0.3,
          y: velocityRef.current.y * 0.7 + dy * 0.3,
        };
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        return;
      }
      // Mousemove can fire above 100Hz; scanning every point that often
      // starves the render loop, so cap how frequently we hover-test
      const now = performance.now();
      if (now - lastHoverTestRef.current < HOVER_THROTTLE_MS) return;
      lastHoverTestRef.current = now;
      const rect = e.currentTarget.getBoundingClientRect();
      const point = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (point !== hoveredRef.current) {
        hoveredRef.current = point;
        setHovered(point ? { point, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top } : null);
      }
    },
    [hitTest],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      if (drag.moved) return; // momentum from velocityRef takes over
      velocityRef.current = { x: 0, y: 0 };
      const rect = e.currentTarget.getBoundingClientRect();
      const point = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (point) onSelectTrack(point);
    },
    [hitTest, onSelectTrack],
  );

  const handleMouseLeave = useCallback(() => {
    dragRef.current = null;
    hoveredRef.current = null;
    setHovered(null);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Genre map of library tracks"
        className={`absolute inset-0 w-full h-full ${hovered ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      {hovered && (
        <div
          className="absolute pointer-events-none z-10 px-3 py-2 rounded-md bg-bg-card border border-border shadow-lg max-w-xs"
          style={{ left: hovered.screenX + 14, top: hovered.screenY + 14 }}
        >
          <div className="text-xs font-medium text-text-primary truncate">
            {hovered.point.track.title ?? hovered.point.track.file_name}
          </div>
          <div className="text-[11px] text-text-secondary truncate">
            {hovered.point.track.artist ?? "Unknown Artist"}
            {hovered.point.track.album ? ` — ${hovered.point.track.album}` : ""}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: hovered.point.color }}>
            {hovered.point.genre}
          </div>
        </div>
      )}
    </div>
  );
};
