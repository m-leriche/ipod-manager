import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

const sizes = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-40 h-40",
  xl: "w-[280px] h-[280px]",
  full: "w-full aspect-square",
} as const;

interface AlbumArtworkProps {
  folderPath: string | null;
  size?: keyof typeof sizes;
  className?: string;
  showMissingLabel?: boolean;
  onRepair?: () => void;
  cacheBust?: number;
}

export const AlbumArtwork = ({
  folderPath,
  size = "md",
  className = "",
  showMissingLabel = false,
  onRepair,
  cacheBust,
}: AlbumArtworkProps) => {
  const [failed, setFailed] = useState(false);

  // Reset failed state when the folder changes or after a repair (cacheBust changes)
  useEffect(() => {
    setFailed(false);
  }, [folderPath, cacheBust]);

  const showFallback = !folderPath || failed;

  return (
    <div className={`${sizes[size]} shrink-0 rounded-lg overflow-hidden ${className}`}>
      {showFallback ? (
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
            </>
          )}
        </div>
      ) : (
        <img
          src={convertFileSrc(folderPath + "/cover.jpg") + (cacheBust ? `?v=${cacheBust}` : "")}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
};
