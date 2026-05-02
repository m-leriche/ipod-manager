import { useState, useCallback, useRef, useEffect } from "react";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import type { Playlist, PlaylistExportResult, SmartPlaylist } from "../../../types/library";

interface PlaylistSidebarProps {
  onPlaylistSelect: (id: number | null) => void;
  activePlaylistId: number | null;
  onSmartPlaylistEdit: (sp: SmartPlaylist) => void;
  onSmartPlaylistCreate: () => void;
}

export const PlaylistSidebar = ({
  onPlaylistSelect,
  activePlaylistId,
  onSmartPlaylistEdit,
  onSmartPlaylistCreate,
}: PlaylistSidebarProps) => {
  const {
    playlists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    exportToIpod,
    smartPlaylists,
    activeSmartPlaylistId,
    setActiveSmartPlaylist,
    deleteSmartPlaylist,
  } = usePlaylist();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "playlist" | "smart";
    playlist?: Playlist;
    smartPlaylist?: SmartPlaylist;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [exportMsg, setExportMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (creating || editingId !== null) inputRef.current?.focus();
  }, [creating, editingId]);

  useEffect(() => {
    if (!contextMenu) return;
    const handle = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const timer = setTimeout(() => window.addEventListener("mousedown", handle), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handle);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!exportMsg) return;
    const timer = setTimeout(() => setExportMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [exportMsg]);

  const handleCreate = useCallback(async () => {
    const name = inputValue.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    try {
      const playlist = await createPlaylist(name);
      onPlaylistSelect(playlist.id);
    } catch (e) {
      alert(`Failed to create playlist: ${e}`);
    }
    setInputValue("");
    setCreating(false);
  }, [inputValue, createPlaylist, onPlaylistSelect]);

  const handleRename = useCallback(async () => {
    const name = inputValue.trim();
    if (!name || editingId === null) {
      setEditingId(null);
      return;
    }
    try {
      await renamePlaylist(editingId, name);
    } catch (e) {
      alert(`Failed to rename playlist: ${e}`);
    }
    setInputValue("");
    setEditingId(null);
  }, [inputValue, editingId, renamePlaylist]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deletePlaylist(id);
      } catch (e) {
        alert(`Failed to delete playlist: ${e}`);
      }
      setContextMenu(null);
    },
    [deletePlaylist],
  );

  const handleDeleteSmart = useCallback(
    async (id: number) => {
      try {
        await deleteSmartPlaylist(id);
      } catch (e) {
        alert(`Failed to delete smart playlist: ${e}`);
      }
      setContextMenu(null);
    },
    [deleteSmartPlaylist],
  );

  const handleExport = useCallback(
    async (playlistIds: number[]) => {
      setContextMenu(null);
      setExporting(true);
      try {
        const result = await exportToIpod(playlistIds);
        setExportMsg(formatExportResult(result));
      } catch (e) {
        const msg = `${e}`;
        if (msg.includes("cancelled")) return;
        setExportMsg({ text: msg, type: "error" });
      } finally {
        setExporting(false);
      }
    },
    [exportToIpod],
  );

  const startCreate = useCallback(() => {
    setCreating(true);
    setInputValue("");
    setEditingId(null);
  }, []);

  const startRename = useCallback((playlist: Playlist) => {
    setEditingId(playlist.id);
    setInputValue(playlist.name);
    setCreating(false);
    setContextMenu(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (creating) handleCreate();
        else if (editingId !== null) handleRename();
      }
      if (e.key === "Escape") {
        setCreating(false);
        setEditingId(null);
        setInputValue("");
      }
    },
    [creating, editingId, handleCreate, handleRename],
  );

  const formatDuration = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const builtinSmartPlaylists = smartPlaylists.filter((sp) => sp.is_builtin);
  const userSmartPlaylists = smartPlaylists.filter((sp) => !sp.is_builtin);

  return (
    <div className="w-[200px] shrink-0 border-r border-border bg-bg-secondary flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Playlists</span>
        <div className="flex items-center gap-1.5">
          {playlists.length > 0 && (
            <button
              onClick={() => handleExport([])}
              disabled={exporting}
              className="text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-30"
              title="Export all playlists to iPod"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
            </button>
          )}
          <button
            onClick={startCreate}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
            title="New Playlist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* "All Tracks" option */}
        <button
          onClick={() => {
            onPlaylistSelect(null);
            setActiveSmartPlaylist(null);
          }}
          className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
            activePlaylistId === null && activeSmartPlaylistId === null
              ? "text-accent bg-accent/10 font-medium"
              : "text-text-secondary hover:bg-bg-hover"
          }`}
        >
          All Tracks
        </button>

        {/* Smart playlists */}
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <span className="text-[9px] font-medium text-text-tertiary uppercase tracking-widest">Smart</span>
          <button
            onClick={onSmartPlaylistCreate}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
            title="New Smart Playlist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Built-in smart playlists */}
        {builtinSmartPlaylists.map((sp) => (
          <button
            key={sp.id}
            onClick={() => {
              onPlaylistSelect(null);
              setActiveSmartPlaylist(sp.id);
            }}
            className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors ${
              activeSmartPlaylistId === sp.id
                ? "text-accent bg-accent/10 font-medium"
                : "text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <SmartPlaylistIcon type={sp.icon} />
            {sp.name}
          </button>
        ))}

        {/* User smart playlists */}
        {userSmartPlaylists.map((sp) => (
          <button
            key={sp.id}
            onClick={() => {
              onPlaylistSelect(null);
              setActiveSmartPlaylist(sp.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: "smart", smartPlaylist: sp });
            }}
            className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors ${
              activeSmartPlaylistId === sp.id
                ? "text-accent bg-accent/10 font-medium"
                : "text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 shrink-0">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
            {sp.name}
          </button>
        ))}

        {/* Playlists header */}
        <div className="px-3 pt-3 pb-1">
          <span className="text-[9px] font-medium text-text-tertiary uppercase tracking-widest">Playlists</span>
        </div>

        {playlists.length === 0 && !creating && (
          <div className="px-3 py-4 text-center">
            <p className="text-[10px] text-text-tertiary">No playlists yet</p>
          </div>
        )}

        {playlists.map((p) => (
          <div key={p.id} className="relative">
            {editingId === p.id ? (
              <div className="px-2 py-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleRename}
                  className="w-full px-2 py-1 bg-bg-card border border-border-active rounded text-[11px] text-text-primary focus:outline-none"
                />
              </div>
            ) : (
              <button
                onClick={() => {
                  onPlaylistSelect(p.id);
                  setActiveSmartPlaylist(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, type: "playlist", playlist: p });
                }}
                className={`w-full text-left px-3 py-1.5 transition-colors group ${
                  activePlaylistId === p.id ? "text-accent bg-accent/10" : "text-text-secondary hover:bg-bg-hover"
                }`}
              >
                <div className="text-[11px] truncate">{p.name}</div>
                <div className="text-[9px] text-text-tertiary">
                  {p.track_count} track{p.track_count !== 1 ? "s" : ""}
                  {p.total_duration > 0 && ` \u00B7 ${formatDuration(p.total_duration)}`}
                </div>
              </button>
            )}
          </div>
        ))}

        {creating && (
          <div className="px-2 py-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCreate}
              placeholder="Playlist name..."
              className="w-full px-2 py-1 bg-bg-card border border-border-active rounded text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Export status toast */}
      {exportMsg && (
        <div
          className={`mx-2 mb-2 px-2.5 py-2 rounded-lg text-[10px] leading-relaxed ${
            exportMsg.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}
        >
          {exportMsg.text}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] bg-bg-card border border-border rounded-xl shadow-lg py-1 overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === "playlist" && contextMenu.playlist && (
            <>
              <button
                onClick={() => startRename(contextMenu.playlist!)}
                className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => handleExport([contextMenu.playlist!.id])}
                disabled={exporting}
                className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-30"
              >
                Export to iPod
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={() => handleDelete(contextMenu.playlist!.id)}
                className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Delete
              </button>
            </>
          )}
          {contextMenu.type === "smart" && contextMenu.smartPlaylist && (
            <>
              <button
                onClick={() => {
                  onSmartPlaylistEdit(contextMenu.smartPlaylist!);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Edit Rules
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={() => handleDeleteSmart(contextMenu.smartPlaylist!.id)}
                className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const SmartPlaylistIcon = ({ type }: { type: string | null }) => {
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

const formatExportResult = (result: PlaylistExportResult): { text: string; type: "success" | "error" } => {
  if (result.exported === 0 && result.errors.length > 0) {
    return { text: result.errors[0], type: "error" };
  }
  const parts = [`${result.exported} playlist${result.exported !== 1 ? "s" : ""} exported`];
  if (result.skipped_tracks > 0) {
    parts.push(`${result.skipped_tracks} track${result.skipped_tracks !== 1 ? "s" : ""} skipped`);
  }
  return { text: parts.join(", "), type: "success" };
};
