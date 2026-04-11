import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { fmtSize, fmtDate, icon } from "./helpers";
import type { FileEntry, FileExplorerProps } from "./types";

const TH = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th
    className={`bg-bg-card px-3 py-1.5 text-left text-[10px] font-medium text-text-tertiary uppercase tracking-wider border-b border-border ${className}`}
  >
    {children}
  </th>
);

const CenterMsg = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`py-12 text-center text-text-tertiary text-xs ${className}`}>{children}</div>
);

export const FileExplorer = ({
  rootPath,
  rootLabel,
  allowParentNavigation = false,
  onSelectFolder,
  selectedFolder,
  allowDelete = false,
}: FileExplorerProps) => {
  const [path, setPath] = useState(rootPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<FileEntry[]>("list_directory", { path: p });
      setEntries(r);
      setPath(p);
    } catch (e) {
      setError(`${e}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(rootPath);
  }, [load, rootPath]);

  const into = (name: string) => load(path.endsWith("/") ? `${path}${name}` : `${path}/${name}`);

  const handleDelete = async (entry: FileEntry) => {
    const fullPath = path.endsWith("/") ? `${path}${entry.name}` : `${path}/${entry.name}`;
    const kind = entry.is_dir ? "folder" : "file";
    if (!window.confirm(`Delete ${kind} "${entry.name}"?`)) return;
    try {
      await invoke("delete_entry", { path: fullPath });
      setEntries((prev) => prev.filter((e) => e.name !== entry.name));
    } catch (e) {
      setError(`Delete failed: ${e}`);
    }
  };

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
    <div
      className={`flex-1 min-w-0 bg-bg-secondary border rounded-2xl flex flex-col transition-colors ${selected ? "border-success/40" : "border-border"}`}
    >
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
          <span
            className="px-1.5 py-0.5 rounded-md cursor-pointer font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all"
            onClick={() => crumbNav(-1)}
          >
            {above ? "/" : rootLabel}
          </span>
          {segs.map((s, i) => (
            <span key={i} className="contents">
              <span className="text-text-tertiary mx-px select-none">/</span>
              <span
                className={`px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-bg-hover transition-all ${i === segs.length - 1 ? "text-text-primary font-medium" : "text-text-secondary"}`}
                onClick={() => crumbNav(i)}
              >
                {s}
              </span>
            </span>
          ))}
        </div>
        {onSelectFolder && (
          <button
            onClick={() => onSelectFolder(path)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border shrink-0 transition-all ${
              selected
                ? "bg-success/10 border-success/30 text-success"
                : "bg-transparent border-border text-text-tertiary hover:border-border-active hover:text-text-secondary"
            }`}
          >
            {selected ? "\u2713 Selected" : "Select"}
          </button>
        )}
      </div>

      {/* Content */}
      {loading && (
        <CenterMsg>
          <Spinner /> Loading...
        </CenterMsg>
      )}
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
                <tr
                  key={e.name}
                  className="transition-colors hover:bg-bg-hover/50 group"
                  onDoubleClick={() => e.is_dir && into(e.name)}
                  onContextMenu={
                    allowDelete
                      ? (ev) => {
                          ev.preventDefault();
                          setCtxMenu({ x: ev.clientX, y: ev.clientY, entry: e });
                        }
                      : undefined
                  }
                >
                  <td className="px-3 py-[5px] text-[11px] border-b border-border-subtle overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="mr-1.5 text-xs align-middle opacity-60">{icon(e)}</span>
                    {e.is_dir ? (
                      <span
                        className="cursor-pointer text-text-primary hover:text-accent transition-colors align-middle"
                        onClick={() => into(e.name)}
                      >
                        {e.name}
                      </span>
                    ) : (
                      <span className="text-text-secondary align-middle">{e.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-[5px] text-[11px] text-text-tertiary border-b border-border-subtle">
                    {fmtSize(e.size)}
                  </td>
                  <td className="px-3 py-[5px] text-[11px] text-text-tertiary border-b border-border-subtle">
                    {fmtDate(e.modified)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-tertiary shrink-0">
        {!loading &&
          !error &&
          `${entries.filter((e) => e.is_dir).length} folders, ${entries.filter((e) => !e.is_dir).length} files`}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[{ label: `Delete "${ctxMenu.entry.name}"`, onClick: () => handleDelete(ctxMenu.entry) }]}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
