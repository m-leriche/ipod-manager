import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import { useLazyImage } from "../../../hooks/useLazyImage";

const sizes = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-40 h-40",
  xl: "w-[280px] h-[280px]",
  full: "w-full aspect-square",
} as const;

/** Map component size to backend thumbnail size. "full" uses raw cover.jpg. */
const THUMB_SIZE_MAP: Record<string, string | null> = {
  sm: "small",
  md: "small",
  lg: "medium",
  xl: "large",
  full: null,
};

interface AlbumArtworkProps {
  folderPath: string | null;
  size?: keyof typeof sizes;
  className?: string;
  showMissingLabel?: boolean;
  onRepair?: () => void;
  onUpload?: () => void;
  cacheBust?: number;
  lazy?: boolean;
}

export const AlbumArtwork = ({
  folderPath,
  size = "md",
  className = "",
  showMissingLabel = false,
  onRepair,
  onUpload,
  cacheBust,
  lazy = true,
}: AlbumArtworkProps) => {
  const { artCacheBust } = useArtCache();
  const [localBust, setLocalBust] = useState(0);
  const effectiveBust = (cacheBust ?? 0) + artCacheBust + localBust;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { ref, isVisible } = useLazyImage(lazy);

  // Thumbnail state
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const thumbRequestRef = useRef(0);

  // Reset failed/loaded state when the folder changes or after a repair (cacheBust changes)
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setThumbSrc(null);
  }, [folderPath, effectiveBust]);

  // Respond to per-folder art fix events (only re-render this artwork when its folder is fixed)
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === folderPath) {
        setLocalBust((n) => n + 1);
      }
    };
    window.addEventListener("album-art-fixed", handler);
    return () => window.removeEventListener("album-art-fixed", handler);
  }, [folderPath]);

  // Request a cached thumbnail when visible
  const thumbSize = THUMB_SIZE_MAP[size] ?? null;
  useEffect(() => {
    if (!folderPath || !thumbSize || !isVisible) return;
    const id = ++thumbRequestRef.current;
    invoke<string | null>("get_thumbnail", { folderPath, size: thumbSize })
      .then((path) => {
        if (id !== thumbRequestRef.current) return;
        if (path) {
          setThumbSrc(convertFileSrc(path) + (effectiveBust ? `?v=${effectiveBust}` : ""));
        }
      })
      .catch(() => {});
  }, [folderPath, thumbSize, effectiveBust, isVisible]);

  const showFallback = !folderPath || failed;
  const showImage = !showFallback && isVisible;

  // Use thumbnail if available, otherwise fall back to raw cover.jpg
  const imgSrc =
    thumbSrc ||
    (folderPath ? convertFileSrc(folderPath + "/cover.jpg") + (effectiveBust ? `?v=${effectiveBust}` : "") : "");

  return (
    <div ref={ref} className={`${sizes[size]} shrink-0 rounded-lg overflow-hidden ${className}`}>
      {showFallback ? (
        <Placeholder showMissingLabel={showMissingLabel} onRepair={onRepair} onUpload={onUpload} />
      ) : (
        <div className="relative w-full h-full">
          {/* Placeholder background shown until image loads */}
          {!loaded && (
            <div className="absolute inset-0 bg-gradient-to-br from-bg-elevated to-bg-card flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="w-1/3 h-1/3 text-text-tertiary/30"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
          )}
          {showImage && (
            <img
              src={imgSrc}
              alt=""
              className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      )}
    </div>
  );
};

const Placeholder = ({
  showMissingLabel,
  onRepair,
  onUpload,
}: {
  showMissingLabel: boolean;
  onRepair?: () => void;
  onUpload?: () => void;
}) => (
  <div className="w-full h-full bg-gradient-to-br from-bg-elevated to-bg-card flex flex-col items-center justify-center gap-1">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-1/3 h-1/3 text-text-tertiary/50"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
    </svg>
    {showMissingLabel && (
      <>
        <span className="text-[9px] text-text-tertiary font-medium">Missing Art</span>
        <div className="flex gap-2">
          {onUpload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpload();
              }}
              className="text-[9px] text-accent hover:text-accent-hover font-medium transition-colors"
            >
              Upload
            </button>
          )}
          {onRepair && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRepair();
              }}
              className="text-[9px] text-accent hover:text-accent-hover font-medium transition-colors"
            >
              Repair
            </button>
          )}
        </div>
      </>
    )}
  </div>
);
