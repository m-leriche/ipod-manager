import { useState, useCallback, useRef, useEffect } from "react";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import type { Playlist } from "../../../types/library";

interface PlaylistSidebarProps {
  onPlaylistSelect: (id: number | null) => void;
  activePlaylistId: number | null;
}

export const PlaylistSidebar = ({ onPlaylistSelect, activePlaylistId }: PlaylistSidebarProps) => {
  const { playlists, createPlaylist, renamePlaylist, deletePlaylist } = usePlaylist();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playlist: Playlist } | null>(null);

  useEffect(() => {
    if (creating || editingId !== null) inputRef.current?.focus();
  }, [creating, editingId]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handle = () => setContextMenu(null);
    const timer = setTimeout(() => window.addEventListener("mousedown", handle), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handle);
    };
  }, [contextMenu]);

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
      console.error("Failed to create playlist:", e);
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
      console.error("Failed to rename playlist:", e);
    }
    setInputValue("");
    setEditingId(null);
  }, [inputValue, editingId, renamePlaylist]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deletePlaylist(id);
      } catch (e) {
        console.error("Failed to delete playlist:", e);
      }
      setContextMenu(null);
    },
    [deletePlaylist],
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

  return (
    <div className="w-[200px] shrink-0 border-r border-border bg-bg-secondary flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Playlists</span>
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

      <div className="flex-1 overflow-y-auto">
        {/* "All Tracks" option */}
        <button
          onClick={() => onPlaylistSelect(null)}
          className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
            activePlaylistId === null ? "text-accent bg-accent/10 font-medium" : "text-text-secondary hover:bg-bg-hover"
          }`}
        >
          All Tracks
        </button>

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
                onClick={() => onPlaylistSelect(p.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, playlist: p });
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

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] bg-bg-card border border-border rounded-xl shadow-lg py-1 overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => startRename(contextMenu.playlist)}
            className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Rename
          </button>
          <div className="h-px bg-border my-1" />
          <button
            onClick={() => handleDelete(contextMenu.playlist.id)}
            className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};
