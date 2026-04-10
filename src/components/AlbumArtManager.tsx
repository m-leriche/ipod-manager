import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

interface AlbumInfo {
  folder_path: string;
  folder_name: string;
  artist: string | null;
  album: string | null;
  track_count: number;
  has_cover_file: boolean;
  has_embedded_art: boolean;
}

interface AlbumArtProgress {
  total: number;
  completed: number;
  current_album: string;
  phase: string;
}

interface ScanProgress {
  albums_found: number;
  current_folder: string;
}

interface AlbumArtResult {
  total: number;
  fixed: number;
  already_ok: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}

type Phase = "idle" | "scanning" | "scanned" | "fixing";

export function AlbumArtManager() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanPath, setScanPath] = useState("");
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<AlbumArtProgress | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<AlbumArtResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    listen<AlbumArtProgress>("albumart-progress", (e) => setProgress(e.payload))
      .then((fn) => unsubs.push(fn));
    listen<ScanProgress>("albumart-scan-progress", (e) => setScanProgress(e.payload))
      .then((fn) => unsubs.push(fn));
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const browse = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Select music folder",
      });
      if (picked) {
        const newPath = picked as string;
        setScanPath(newPath);
        scan(newPath);
      }
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  };

  const scan = async (path?: string) => {
    const targetPath = path ?? scanPath;
    setPhase("scanning");
    setError(null);
    setResult(null);
    setAlbums([]);
    setScanProgress(null);
    try {
      const data = await invoke<AlbumInfo[]>("scan_album_art", { path: targetPath });
      setAlbums(data);
      setSelected(new Set(data.filter((a) => !a.has_cover_file).map((a) => a.folder_path)));
      setPhase("scanned");
    } catch (e) {
      setError(`${e}`);
      setPhase("idle");
    }
  };

  const fix = async () => {
    setPhase("fixing");
    setProgress(null);
    setResult(null);
    try {
      const res = await invoke<AlbumArtResult>("fix_album_art", { folders: [...selected] });
      setResult(res);
      setProgress(null);
      setPhase("scanned");
      // Re-scan in background to update album list
      try {
        const data = await invoke<AlbumInfo[]>("scan_album_art", { path: scanPath });
        setAlbums(data);
        setSelected(new Set(data.filter((a) => !a.has_cover_file).map((a) => a.folder_path)));
      } catch (_) {}
    } catch (e) {
      setError(`${e}`);
      setPhase("scanned");
    }
  };

  const cancel = async () => {
    try {
      await invoke("cancel_sync");
    } catch (_) {}
  };

  const missing = albums.filter((a) => !a.has_cover_file && !a.has_embedded_art);
  const extractable = albums.filter((a) => !a.has_cover_file && a.has_embedded_art);
  const hasCover = albums.filter((a) => a.has_cover_file);

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectAll = () =>
    setSelected(new Set(albums.filter((a) => !a.has_cover_file).map((a) => a.folder_path)));
  const selectNone = () => setSelected(new Set());

  // ── Idle ──

  if (phase === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-text-tertiary text-xs mb-4">
            Choose a music folder to scan for missing album art
          </p>
          <div className="flex items-center gap-2 mb-4 bg-bg-secondary border border-border rounded-xl px-3 py-2">
            <span className={`flex-1 min-w-0 text-[11px] font-medium truncate text-left ${scanPath ? "text-text-secondary" : "text-text-tertiary"}`}>
              {scanPath || "No folder selected"}
            </span>
            <button
              onClick={browse}
              className="px-2.5 py-1 bg-bg-card border border-border text-text-tertiary rounded-lg text-[10px] font-medium shrink-0 hover:text-text-secondary hover:border-border-active transition-all"
            >
              Browse
            </button>
          </div>
          <button
            onClick={() => scan()}
            disabled={!scanPath}
            className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Scan for Missing Art
          </button>
          {error && <p className="mt-3 text-danger text-[11px]">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Scanning ──

  if (phase === "scanning") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-text-tertiary text-xs mb-1">
            <Spinner /> Scanning albums...
          </div>
          {scanProgress && (
            <>
              <div className="text-[11px] text-text-secondary font-medium">
                {scanProgress.albums_found} album
                {scanProgress.albums_found !== 1 ? "s" : ""} found
              </div>
              <div className="text-[10px] text-text-tertiary mt-1 max-w-xs truncate mx-auto">
                {scanProgress.current_folder}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Scanned / Fixing ──

  return (
    <>
      {/* Path bar */}
      <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-2xl px-4 py-2 shrink-0">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">
          Folder
        </span>
        <span className="flex-1 min-w-0 text-[11px] text-text-secondary font-medium truncate">
          {scanPath}
        </span>
        <button
          onClick={browse}
          disabled={phase === "fixing"}
          className="px-2.5 py-1 bg-bg-card border border-border text-text-tertiary rounded-lg text-[10px] font-medium shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
        >
          Browse
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-5 px-4 py-2 bg-bg-secondary border border-border rounded-2xl shrink-0 text-[11px] font-medium">
        <span className="text-text-secondary">{albums.length} albums</span>
        <span className="text-success">{hasCover.length} have art</span>
        <span className="text-accent">{extractable.length} extractable</span>
        <span className="text-warning">{missing.length} missing</span>
      </div>

      {/* Progress or actions */}
      {phase === "fixing" && progress ? (
        <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-text-primary">
              Fixing album art...
            </span>
            <span className="text-[11px] text-text-secondary">
              {progress.completed} of {progress.total}
            </span>
          </div>
          <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-text-primary rounded-full transition-all duration-200"
              style={{
                width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary truncate flex-1 min-w-0 mr-3">
              {progress.current_album}
            </span>
            <button
              onClick={cancel}
              className="px-3 py-1 border border-danger/30 text-danger rounded-lg text-[10px] font-medium shrink-0 hover:bg-danger/10 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fix}
            disabled={selected.size === 0}
            className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Fix {selected.size} Albums
          </button>
          <button
            onClick={() => scan()}
            className="px-3 py-2 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:bg-bg-hover hover:text-text-primary transition-all"
          >
            ↻ Rescan
          </button>
          <div className="flex-1" />
          <Pill onClick={selectAll}>Select All</Pill>
          <Pill onClick={selectNone}>None</Pill>
        </div>
      )}

      {/* Result toast */}
      {result && phase !== "fixing" && (
        <div
          className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed shrink-0 ${
            result.failed > 0
              ? "bg-warning/10 text-warning"
              : "bg-success/10 text-success"
          }`}
        >
          {result.cancelled
            ? `Cancelled — fixed ${result.fixed} of ${result.total}`
            : `Fixed ${result.fixed} album${result.fixed !== 1 ? "s" : ""}`}
          {result.already_ok > 0 && `, ${result.already_ok} already had art`}
          {result.failed > 0 && `, ${result.failed} failed`}
          {result.errors.length > 0 && (
            <div className="mt-1 text-[10px] opacity-70">
              {result.errors.slice(0, 5).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger shrink-0">
          {error}
        </div>
      )}

      {/* Album list */}
      <div className="flex-1 overflow-y-auto bg-bg-secondary border border-border rounded-2xl min-h-0">
        {albums.length === 0 ? (
          <div className="py-12 text-center text-text-tertiary text-xs">
            No albums found in this folder
          </div>
        ) : missing.length === 0 && extractable.length === 0 ? (
          <div className="py-12 text-center text-text-tertiary text-xs">
            All albums have cover art!
          </div>
        ) : (
          <div>
            {extractable.length > 0 && (
              <AlbumGroup
                title="Embedded Art Available"
                subtitle="Can extract from audio files"
                albums={extractable}
                selected={selected}
                onToggle={toggle}
              />
            )}
            {missing.length > 0 && (
              <AlbumGroup
                title="Missing Art"
                subtitle="Will search MusicBrainz"
                albums={missing}
                selected={selected}
                onToggle={toggle}
              />
            )}
            {hasCover.length > 0 && (
              <AlbumGroup title="Has Cover Art" albums={hasCover} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function AlbumGroup({
  title,
  subtitle,
  albums,
  selected,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  albums: AlbumInfo[];
  selected?: Set<string>;
  onToggle?: (path: string) => void;
}) {
  const selectable = !!selected && !!onToggle;
  return (
    <div>
      <div className="px-3 py-2 bg-bg-card border-b border-border sticky top-0 z-10">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">
          {title}
        </span>
        {subtitle && (
          <span className="text-[10px] text-text-tertiary ml-2">— {subtitle}</span>
        )}
        <span className="text-[10px] text-text-tertiary ml-2">({albums.length})</span>
      </div>
      {albums.map((a) => (
        <div
          key={a.folder_path}
          className={`flex items-center gap-3 px-3 py-2 border-b border-border-subtle transition-colors ${
            selectable ? "hover:bg-bg-hover/50" : "opacity-40"
          }`}
        >
          {selectable ? (
            <input
              type="checkbox"
              checked={selected!.has(a.folder_path)}
              onChange={() => onToggle!(a.folder_path)}
              className="w-3 h-3 cursor-pointer accent-accent rounded shrink-0"
            />
          ) : (
            <span className="text-success text-[10px] w-3 text-center shrink-0">
              ✓
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-text-primary font-medium truncate">
              {a.artist && a.album ? `${a.artist} — ${a.album}` : a.folder_name}
            </div>
            <div className="text-[10px] text-text-tertiary">
              {a.track_count} tracks
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Pill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-text-tertiary hover:text-text-secondary transition-all"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border-[1.5px] border-text-tertiary border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />
  );
}
