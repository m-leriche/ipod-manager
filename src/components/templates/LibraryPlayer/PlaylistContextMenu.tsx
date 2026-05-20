import { useRef, useEffect } from "react";
import type { Playlist, SmartPlaylist } from "../../../types/library";

interface PlaylistContextMenuState {
  x: number;
  y: number;
  type: "playlist" | "smart";
  playlist?: Playlist;
  smartPlaylist?: SmartPlaylist;
}

interface PlaylistContextMenuProps {
  menu: PlaylistContextMenuState;
  exporting: boolean;
  onClose: () => void;
  onRename: (playlist: Playlist) => void;
  onDelete: (id: number, name: string) => void;
  onDeleteSmart: (id: number, name: string) => void;
  onExport: (playlistIds: number[]) => void;
  onEditSmartPlaylist: (sp: SmartPlaylist) => void;
}

export type { PlaylistContextMenuState };

export const PlaylistContextMenu = ({
  menu,
  exporting,
  onClose,
  onRename,
  onDelete,
  onDeleteSmart,
  onExport,
  onEditSmartPlaylist,
}: PlaylistContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => window.addEventListener("mousedown", handle), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handle);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] bg-bg-card border border-border rounded-xl shadow-lg py-1 overflow-hidden"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.type === "playlist" && menu.playlist && (
        <>
          <MenuButton onClick={() => onRename(menu.playlist!)}>Rename</MenuButton>
          <MenuButton onClick={() => onExport([menu.playlist!.id])} disabled={exporting}>
            Export to iPod
          </MenuButton>
          <div className="h-px bg-border my-1" />
          <MenuButton onClick={() => onDelete(menu.playlist!.id, menu.playlist!.name)}>Delete</MenuButton>
        </>
      )}
      {menu.type === "smart" && menu.smartPlaylist && (
        <>
          <MenuButton
            onClick={() => {
              onEditSmartPlaylist(menu.smartPlaylist!);
              onClose();
            }}
          >
            Edit Rules
          </MenuButton>
          <div className="h-px bg-border my-1" />
          <MenuButton onClick={() => onDeleteSmart(menu.smartPlaylist!.id, menu.smartPlaylist!.name)}>
            Delete
          </MenuButton>
        </>
      )}
    </div>
  );
};

const MenuButton = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-30"
  >
    {children}
  </button>
);

// ── Smart playlist icons ────────────────────────────────────────

export const SmartPlaylistIcon = ({ type }: { type: string | null }) => {
  switch (type) {
    case "clock":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 shrink-0">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7v5l3 3" />
        </svg>
      );
    case "fire":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 shrink-0">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18z"
          />
        </svg>
      );
    case "circle":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 shrink-0">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 shrink-0">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
          />
        </svg>
      );
  }
};

export const formatExportResult = (
  result: import("../../../types/library").PlaylistExportResult,
): { text: string; type: "success" | "error" } => {
  if (result.exported === 0 && result.errors.length > 0) {
    return { text: result.errors[0], type: "error" };
  }
  const parts = [`${result.exported} playlist${result.exported !== 1 ? "s" : ""} exported`];
  if (result.skipped_tracks > 0) {
    parts.push(`${result.skipped_tracks} track${result.skipped_tracks !== 1 ? "s" : ""} skipped`);
  }
  return { text: parts.join(", "), type: "success" };
};
