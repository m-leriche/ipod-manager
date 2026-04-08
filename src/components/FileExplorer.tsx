import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

const AUDIO_EXT = new Set(["mp3","flac","aac","m4a","ogg","opus","wav","wma","aiff","alac"]);

function fmtSize(b: number): string {
  if (b === 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function fmtDate(s: number): string {
  if (s === 0) return "";
  const d = new Date(s * 1000), now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function icon(e: FileEntry): string {
  if (e.is_dir) return "\ud83d\udcc1";
  const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXT.has(ext) ? "\ud83c\udfb5" : "\ud83d\udcc4";
}

interface Props {
  rootPath: string;
  rootLabel: string;
  allowParentNavigation?: boolean;
  onSelectFolder?: (path: string) => void;
  selectedFolder?: string | null;
}

export function FileExplorer({ rootPath, rootLabel, allowParentNavigation = false, onSelectFolder, selectedFolder }: Props) {
  const [path, setPath] = useState(rootPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true); setError(null);
    try {
      const r = await invoke<FileEntry[]>("list_directory", { path: p });
      setEntries(r); setPath(p);
    } catch (e) { setError(`${e}`); setEntries([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(rootPath); }, [load, rootPath]);

  const into = (name: string) => load(path.endsWith("/") ? `${path}${name}` : `${path}/${name}`);
  const up = () => {
    if (!allowParentNavigation && path === rootPath) return;
    if (path === "/") return;
    const parent = path.substring(0, path.lastIndexOf("/")) || "/";
    load(!allowParentNavigation && !parent.startsWith(rootPath) ? rootPath : parent);
  };

  const canUp = allowParentNavigation ? path !== "/" : path !== rootPath;
  const above = !path.startsWith(rootPath);
  const rel = path.startsWith(rootPath) ? path.slice(rootPath.length) : path;
  const segs = (above ? path : rel).split("/").filter(Boolean);
  const selected = selectedFolder === path;

  const crumbNav = (i: number) => {
    if (above) load(i < 0 ? "/" : "/" + segs.slice(0, i + 1).join("/"));
    else load(i < 0 ? rootPath : rootPath + "/" + segs.slice(0, i + 1).join("/"));
  };

  return (
    <div className={`flex-1 min-w-0 bg-bg-secondary border rounded-2xl flex flex-col transition-colors ${selected ? "border-success/40" : "border-border"}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button
          disabled={!canUp}
          onClick={up}
          className="w-7 h-7 bg-bg-card border border-border rounded-lg text-xs text-text-secondary flex items-center justify-center hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-20 transition-all shrink-0"
        >
          &larr;
        </button>
        <div className="flex items-center gap-px text-[11px] overflow-x-auto whitespace-nowrap flex-1 min-w-0">
          <span className="px-1.5 py-0.5 rounded-md cursor-pointer font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all" onClick={() => crumbNav(-1)}>
            {above ? "/" : rootLabel}
          </span>
          {segs.map((s, i) => (
            <span key={i} className="contents">
              <span className="text-text-tertiary mx-px select-none">/</span>
              <span
                className={`px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-bg-hover transition-all ${i === segs.length - 1 ? "text-text-primary font-medium" : "text-text-secondary"}`}
                onClick={() => crumbNav(i)}
              >{s}</span>
            </span>
          ))}
        </div>
        {onSelectFolder && (
          <button
            onClick={() => onSelectFolder(path)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border shrink-0 transition-all ${
              selected ? "bg-success/10 border-success/30 text-success" : "bg-transparent border-border text-text-tertiary hover:border-border-active hover:text-text-secondary"
            }`}
          >
            {selected ? "\u2713 Selected" : "Select"}
          </button>
        )}
      </div>

      {/* Content */}
      {loading && <CenterMsg><Spinner /> Loading...</CenterMsg>}
      {error && <CenterMsg className="text-danger">{error}</CenterMsg>}
      {!loading && !error && entries.length === 0 && <CenterMsg>Empty folder</CenterMsg>}

      {!loading && !error && entries.length > 0 && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <table className="w-full border-collapse table-fixed">
            <thead className="sticky top-0 z-10">
              <tr>
                <TH className="w-[60%]">Name</TH>
                <TH className="w-[20%]">Size</TH>
                <TH className="w-[20%]">Modified</TH>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.name} className="transition-colors hover:bg-bg-hover/50 group" onDoubleClick={() => e.is_dir && into(e.name)}>
                  <td className="px-3 py-[5px] text-[11px] border-b border-border-subtle overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="mr-1.5 text-xs align-middle opacity-60">{icon(e)}</span>
                    {e.is_dir ? (
                      <span className="cursor-pointer text-text-primary hover:text-accent transition-colors align-middle" onClick={() => into(e.name)}>{e.name}</span>
                    ) : (
                      <span className="text-text-secondary align-middle">{e.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-[5px] text-[11px] text-text-tertiary border-b border-border-subtle">{fmtSize(e.size)}</td>
                  <td className="px-3 py-[5px] text-[11px] text-text-tertiary border-b border-border-subtle">{fmtDate(e.modified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-tertiary shrink-0">
        {!loading && !error && `${entries.filter((e) => e.is_dir).length} folders, ${entries.filter((e) => !e.is_dir).length} files`}
      </div>
    </div>
  );
}

function TH({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`bg-bg-card px-3 py-1.5 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider border-b border-border ${className}`}>{children}</th>;
}

function CenterMsg({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`py-12 text-center text-text-tertiary text-xs ${className}`}>{children}</div>;
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border-[1.5px] border-text-tertiary border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />;
}
