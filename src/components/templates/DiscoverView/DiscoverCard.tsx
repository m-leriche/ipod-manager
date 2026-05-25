import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import type { ContextMenuItem } from "../../molecules/ContextMenu/types";
import { formatListeners } from "./helpers";
import type { DiscoverAlbum } from "./types";

interface DiscoverCardProps {
  album: DiscoverAlbum;
  onWatchArtist?: (name: string) => void;
  onDismiss?: () => void;
  replacing?: boolean;
}

export const DiscoverCard = ({ album, onWatchArtist, onDismiss, replacing }: DiscoverCardProps) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const openUrl = useCallback(() => {
    if (album.url) invoke("lastfm_open_auth_url", { url: album.url }).catch(() => {});
  }, [album.url]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const menuItems: ContextMenuItem[] = [
    { label: "Open on Last.fm", onClick: openUrl },
    ...(onWatchArtist
      ? [{ label: `Watch ${album.artist_name}`, onClick: () => onWatchArtist(album.artist_name) } as ContextMenuItem]
      : []),
    ...(onDismiss ? [{ type: "separator" } as ContextMenuItem, { label: "Not interested", onClick: onDismiss }] : []),
  ];

  const listeners = formatListeners(album.listeners);

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        onClick={openUrl}
        title={`${album.name} by ${album.artist_name}`}
        className={`group relative flex flex-col items-center text-center rounded-xl p-2 transition-all duration-150 hover:bg-bg-card/50 hover:scale-[1.03] hover:shadow-lg hover:shadow-black/20 cursor-pointer ${replacing ? "opacity-40" : ""}`}
      >
        <div className="w-full aspect-square rounded-lg overflow-hidden bg-bg-elevated relative">
          {album.image_url && !imgError ? (
            <img
              src={album.image_url}
              alt={`${album.name} cover`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={`w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            />
          ) : null}
          {(!album.image_url || imgError || !imgLoaded) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                className="w-8 h-8 text-text-tertiary/30"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                />
              </svg>
            </div>
          )}
          {/* Dismiss button — visible on hover */}
          {onDismiss && !replacing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white/70 hover:text-white hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Not interested — replace with something else"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="mt-2 w-full min-w-0 px-0.5">
          <div className="text-[11px] font-medium text-text-primary truncate">{album.name}</div>
          <div className="text-[10px] text-text-tertiary truncate">{album.artist_name}</div>
          {listeners && <div className="text-[10px] text-text-tertiary/50 mt-0.5">{listeners} plays</div>}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </>
  );
};
