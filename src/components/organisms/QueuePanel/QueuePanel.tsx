import { useState, useRef, useCallback } from "react";
import { usePlayback } from "../../../contexts/PlaybackContext";

interface QueuePanelProps {
  onClose: () => void;
}

const formatDuration = (secs: number): string => {
  if (!isFinite(secs) || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const QueuePanel = ({ onClose }: QueuePanelProps) => {
  const { state, removeFromQueue, reorderQueue, clearQueue, playTrack } = usePlayback();
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartYRef = useRef(0);
  const dragActiveRef = useRef(false);

  const handleDragMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (e.button !== 0) return;
      setDragFromIndex(index);
      dragStartYRef.current = e.clientY;
      dragActiveRef.current = false;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragActiveRef.current && Math.abs(ev.clientY - dragStartYRef.current) > 4) {
          dragActiveRef.current = true;
        }
        if (!dragActiveRef.current) return;

        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const row = target?.closest("[data-queue-index]") as HTMLElement | null;
        if (row) {
          setDragOverIndex(parseInt(row.dataset.queueIndex!, 10));
        }
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);

        if (dragActiveRef.current) {
          setDragOverIndex((overIdx) => {
            setDragFromIndex((fromIdx) => {
              if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx) {
                reorderQueue(fromIdx, overIdx);
              }
              return null;
            });
            return null;
          });
        } else {
          setDragFromIndex(null);
          setDragOverIndex(null);
        }
        dragActiveRef.current = false;
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [reorderQueue],
  );

  return (
    <div className="w-[320px] shrink-0 border-l border-border bg-bg-secondary flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-xs font-medium text-text-primary">Queue</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={clearQueue}
            className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Clear
          </button>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {state.queue.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-tertiary text-[11px]">Queue is empty</div>
        ) : (
          state.queue.map((track, i) => {
            const isCurrent = i === state.queueIndex;
            const isDragging = dragFromIndex === i && dragActiveRef.current;
            const isDropTarget = dragOverIndex === i && dragFromIndex !== i;
            return (
              <div
                key={`${track.id}-${i}`}
                data-queue-index={i}
                onDoubleClick={() => playTrack(track, state.queue)}
                className={`flex items-center gap-2 px-2 py-2 cursor-default select-none transition-colors ${
                  isCurrent ? "bg-accent/10" : "hover:bg-bg-hover/50"
                } ${isDragging ? "opacity-40" : ""} ${isDropTarget ? "border-t-2 border-t-accent" : ""}`}
              >
                {/* Drag handle */}
                <div
                  onMouseDown={(e) => handleDragMouseDown(e, i)}
                  className="shrink-0 cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary px-1"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                    <circle cx="9" cy="6" r="1.5" />
                    <circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" />
                    <circle cx="15" cy="18" r="1.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[11px] font-medium truncate ${isCurrent ? "text-accent" : "text-text-primary"}`}
                  >
                    {track.title || track.file_name}
                  </div>
                  <div className="text-[10px] text-text-tertiary truncate">
                    {track.artist || "Unknown Artist"}
                    {" · "}
                    {formatDuration(track.duration_secs)}
                  </div>
                </div>
                {!isCurrent && (
                  <button
                    onClick={() => removeFromQueue(i)}
                    className="text-text-tertiary hover:text-text-secondary transition-colors shrink-0"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
