import { useState, useCallback, useRef, useEffect } from "react";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useToast } from "../../../contexts/ToastContext";
import { ConfirmDialog } from "../../atoms/ConfirmDialog/ConfirmDialog";
import { PlaylistContextMenu, SmartPlaylistIcon, formatExportResult } from "./PlaylistContextMenu";
import type { PlaylistContextMenuState } from "./PlaylistContextMenu";
import type { Playlist, SmartPlaylist } from "../../../types/library";

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
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<PlaylistContextMenuState | null>(null);
  const [exportMsg, setExportMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string; type: "playlist" | "smart" } | null>(
    null,
  );

  useEffect(() => {
    if (creating || editingId !== null) inputRef.current?.focus();
  }, [creating, editingId]);

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
      toast.error(`Failed to create playlist: ${e}`);
    }
    setInputValue("");
    setCreating(false);
  }, [inputValue, createPlaylist, onPlaylistSelect, toast]);

  const handleRename = useCallback(async () => {
    const name = inputValue.trim();
    if (!name || editingId === null) {
      setEditingId(null);
      return;
    }
    try {
      await renamePlaylist(editingId, name);
    } catch (e) {
      toast.error(`Failed to rename playlist: ${e}`);
    }
    setInputValue("");
    setEditingId(null);
  }, [inputValue, editingId, renamePlaylist, toast]);

  const handleDelete = useCallback((id: number, name: string) => {
    setPendingDelete({ id, name, type: "playlist" });
    setContextMenu(null);
  }, []);

  const handleDeleteSmart = useCallback((id: number, name: string) => {
    setPendingDelete({ id, name, type: "smart" });
    setContextMenu(null);
  }, []);

  const confirmDelete = useCallback(
    async (id: number, type: "playlist" | "smart") => {
      try {
        if (type === "playlist") {
          await deletePlaylist(id);
        } else {
          await deleteSmartPlaylist(id);
        }
      } catch (e) {
        toast.error(`Failed to delete ${type === "smart" ? "smart playlist" : "playlist"}: ${e}`);
      }
      setPendingDelete(null);
    },
    [deletePlaylist, deleteSmartPlaylist, toast],
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
    <div className="w-[200px] shrink-0 border-r border-border bg-bg-secondary flex flex-col overflow-hidden panel-slide-left">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Playlists</span>
        <div className="flex items-center gap-1.5">
          {playlists.length > 0 && (
            <button
              onClick={() => handleExport([])}
              disabled={exporting}
              className="text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-30"
              title="Export all playlists to iPod"
              aria-label="Export all playlists to iPod"
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
            onClick={() => {
              setCreating(true);
              setInputValue("");
              setEditingId(null);
            }}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
            title="New Playlist"
            aria-label="New Playlist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* All Tracks */}
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
            aria-label="New Smart Playlist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

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

        {/* Playlists */}
        <div className="px-3 pt-3 pb-1">
          <span className="text-[9px] font-medium text-text-tertiary uppercase tracking-widest">Playlists</span>
        </div>

        {playlists.length === 0 && !creating && (
          <div className="px-3 py-4 flex flex-col items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-5 h-5 text-text-tertiary/30"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <p className="text-[10px] text-text-tertiary/60">No playlists yet</p>
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
        <PlaylistContextMenu
          menu={contextMenu}
          exporting={exporting}
          onClose={() => setContextMenu(null)}
          onRename={startRename}
          onDelete={handleDelete}
          onDeleteSmart={handleDeleteSmart}
          onExport={handleExport}
          onEditSmartPlaylist={onSmartPlaylistEdit}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.type === "smart" ? "Smart Playlist" : "Playlist"}`}
          message={`Are you sure you want to delete "${pendingDelete.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => confirmDelete(pendingDelete.id, pendingDelete.type)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};
