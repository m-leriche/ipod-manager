import { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProgress } from "../../../contexts/ProgressContext";
import { cancelSync } from "../../../utils/cancelSync";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { InlineRenameInput } from "./InlineRenameInput";
import { useFileSelection } from "./useFileSelection";
import { useClipboard } from "./useClipboard";
import { useFileOperations } from "./useFileOperations";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useDragAndDrop } from "./useDragAndDrop";
import { fmtSize, fmtDate, icon, joinPath, buildContextMenuItems } from "./helpers";
import type { FileEntry, FileExplorerProps, FileExplorerHandle, ContextMenuState } from "./types";

const TH = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th
    className={`bg-bg-card px-3 py-2 text-left text-[11px] font-medium text-text-tertiary uppercase tracking-wider border-b border-border ${className}`}
  >
    {children}
  </th>
);

const CenterMsg = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`py-12 text-center text-text-tertiary text-xs ${className}`}>{children}</div>
);

export const FileExplorer = forwardRef<FileExplorerHandle, FileExplorerProps>(
  (
    {
      rootPath,
      rootLabel,
      allowParentNavigation = false,
      onSelectFolder,
      selectedFolder,
      allowDelete = false,
      paneId,
      onExternalDrop,
    },
    ref,
  ) => {
    const [path, setPath] = useState(rootPath);
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
    const [renamingEntry, setRenamingEntry] = useState<string | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [filter, setFilter] = useState("");

    // Inline tree expansion — expand folders without navigating
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [subEntries, setSubEntries] = useState<Map<string, FileEntry[]>>(new Map());
    const subEntriesRef = useRef(subEntries);
    subEntriesRef.current = subEntries;

    const containerRef = useRef<HTMLDivElement>(null);
    const pathRef = useRef(path);
    pathRef.current = path;

    // ── Filtered entries + flat row IDs (needed before selection hook) ──
    const filteredEntries = useMemo(() => {
      if (!filter) return entries;
      const lower = filter.toLowerCase();
      return entries.filter((e) => e.name.toLowerCase().includes(lower));
    }, [entries, filter]);

    type FlatRow = { entry: FileEntry; parentPath: string; depth: number };
    const flatRows = useMemo(() => {
      const build = (items: FileEntry[], parentPath: string, depth: number): FlatRow[] => {
        const rows: FlatRow[] = [];
        for (const item of items) {
          rows.push({ entry: item, parentPath, depth });
          if (item.is_dir) {
            const fp = joinPath(parentPath, item.name);
            if (expandedFolders.has(fp) && subEntries.has(fp)) {
              rows.push(...build(subEntries.get(fp)!, fp, depth + 1));
            }
          }
        }
        return rows;
      };
      return build(filteredEntries, path, 0);
    }, [filteredEntries, path, expandedFolders, subEntries]);

    const flatRowIds = useMemo(() => flatRows.map((r) => joinPath(r.parentPath, r.entry.name)), [flatRows]);

    const { selected, handleClick, selectAll, clearSelection, isSelected } = useFileSelection(flatRowIds, path);
    const { clipboard, copy, cut, clear: clearClipboard, isCut } = useClipboard();
    const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();

    const load = useCallback(async (p: string) => {
      setLoading(true);
      setError(null);
      setRenamingEntry(null);
      setCreatingFolder(false);
      setFilter("");
      setExpandedFolders(new Set());
      setSubEntries(new Map());
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

    const reload = useCallback(() => load(pathRef.current), [load]);
    const { handleRename, handleCreateFolder, handleDelete, handlePaste } = useFileOperations(path, entries, reload);

    useImperativeHandle(ref, () => ({ reload }), [reload]);

    useEffect(() => {
      load(rootPath);
    }, [load, rootPath]);

    // ── Drag and drop ──────────────────────────────────────────────

    const handleDrop = useCallback(
      async (operations: { source_path: string; dest_path: string }[], isMove: boolean) => {
        const action = isMove ? "Moving" : "Copying";
        const label =
          operations.length === 1 ? (operations[0].source_path.split("/").pop() ?? "") : `${operations.length} items`;
        startProgress(`${action} ${label}...`, cancelSync);

        const unlisten = await listen<{ total: number; completed: number; current_file: string }>(
          "sync-progress",
          (e) => updateProgress(e.payload.completed, e.payload.total, e.payload.current_file),
        );

        try {
          if (isMove) {
            await invoke("move_files", { operations });
          } else {
            await invoke("copy_files", { operations });
          }
          finishProgress(`${isMove ? "Moved" : "Copied"} ${label}`);
        } catch (e) {
          failProgress(`${isMove ? "Move" : "Copy"} failed: ${e}`);
        } finally {
          unlisten();
        }

        await reload();
        if (isMove) onExternalDrop?.();
      },
      [reload, onExternalDrop, startProgress, updateProgress, finishProgress, failProgress],
    );

    const dnd = useDragAndDrop({ paneId, currentPath: path, selected, onDrop: handleDrop });

    const up = () => {
      if (!allowParentNavigation && path === rootPath) return;
      if (path === "/") return;
      const parent = path.substring(0, path.lastIndexOf("/")) || "/";
      load(!allowParentNavigation && !parent.startsWith(rootPath) ? rootPath : parent);
    };

    // ── Inline tree expansion ────────────────────────────────────
    const toggleExpand = useCallback(async (folderPath: string) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(folderPath)) next.delete(folderPath);
        else next.add(folderPath);
        return next;
      });
      if (!subEntriesRef.current.has(folderPath)) {
        try {
          const children = await invoke<FileEntry[]>("list_directory", { path: folderPath });
          setSubEntries((prev) => new Map(prev).set(folderPath, children));
        } catch {
          /* ignore load failures for sub-entries */
        }
      }
    }, []);

    // ── Clipboard actions ──────────────────────────────────────────

    const selectedPaths = useMemo(() => [...selected], [selected]);

    const handleCopy = useCallback(() => {
      if (selected.size > 0) copy(selectedPaths, path);
    }, [selected, selectedPaths, path, copy]);

    const handleCut = useCallback(() => {
      if (selected.size > 0 && allowDelete) cut(selectedPaths, path);
    }, [selected, selectedPaths, path, allowDelete, cut]);

    const handlePasteAction = useCallback(async () => {
      if (!clipboard) return;
      await handlePaste(clipboard);
      if (clipboard.operation === "cut") clearClipboard();
    }, [clipboard, handlePaste, clearClipboard]);

    const handleDeleteAction = useCallback(() => {
      if (selected.size > 0 && allowDelete) handleDelete(selectedPaths);
    }, [selected, allowDelete, handleDelete, selectedPaths]);

    const handleRenameAction = useCallback(() => {
      if (selected.size !== 1) return;
      const selectedPath = [...selected][0];
      const parent = selectedPath.substring(0, selectedPath.lastIndexOf("/"));
      if (parent !== path) return;
      setRenamingEntry(selectedPath.split("/").pop()!);
    }, [selected, path]);

    const handleNewFolder = useCallback(() => {
      setCreatingFolder(true);
    }, []);

    const handleEnter = useCallback(() => {
      if (selected.size !== 1) return;
      const selectedPath = [...selected][0];
      const row = flatRows.find((r) => joinPath(r.parentPath, r.entry.name) === selectedPath);
      if (!row) return;
      if (row.entry.is_dir) {
        load(selectedPath);
      } else {
        const parent = selectedPath.substring(0, selectedPath.lastIndexOf("/"));
        if (parent === path) setRenamingEntry(row.entry.name);
      }
    }, [selected, flatRows, path, load]);

    // ── Keyboard shortcuts ─────────────────────────────────────────

    const handlers = useMemo(
      () => ({
        onCopy: handleCopy,
        onCut: handleCut,
        onPaste: handlePasteAction,
        onDelete: handleDeleteAction,
        onSelectAll: selectAll,
        onRename: handleRenameAction,
        onNewFolder: handleNewFolder,
        onEnter: handleEnter,
      }),
      [
        handleCopy,
        handleCut,
        handlePasteAction,
        handleDeleteAction,
        selectAll,
        handleRenameAction,
        handleNewFolder,
        handleEnter,
      ],
    );

    useKeyboardShortcuts(containerRef, handlers);

    // ── Context menu ───────────────────────────────────────────────

    const openContextMenu = (e: React.MouseEvent, target: "entry" | "empty", entry?: FileEntry, entryPath?: string) => {
      e.preventDefault();
      if (target === "entry" && entry && entryPath && !isSelected(entryPath)) {
        handleClick(entryPath, { metaKey: false, shiftKey: false });
      }
      if (target === "empty") {
        clearSelection();
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, target, entry });
    };

    const contextMenuItems = useMemo(() => {
      if (!ctxMenu) return [];
      return buildContextMenuItems({
        target: ctxMenu.target,
        selectedCount: ctxMenu.target === "entry" ? Math.max(selected.size, 1) : 0,
        clipboard,
        allowDelete,
        onCopy: handleCopy,
        onCut: handleCut,
        onPaste: handlePasteAction,
        onRename: handleRenameAction,
        onNewFolder: handleNewFolder,
        onDelete: handleDeleteAction,
      });
    }, [
      ctxMenu,
      selected.size,
      clipboard,
      allowDelete,
      handleCopy,
      handleCut,
      handlePasteAction,
      handleRenameAction,
      handleNewFolder,
      handleDeleteAction,
    ]);

    // ── Navigation ─────────────────────────────────────────────────

    const canUp = allowParentNavigation ? path !== "/" : path !== rootPath;
    const above = !path.startsWith(rootPath);
    const rel = path.startsWith(rootPath) ? path.slice(rootPath.length) : path;
    const segs = (above ? path : rel).split("/").filter(Boolean);
    const folderSelected = selectedFolder === path;

    const crumbNav = (i: number) => {
      if (above) load(i < 0 ? "/" : "/" + segs.slice(0, i + 1).join("/"));
      else load(i < 0 ? rootPath : rootPath + "/" + segs.slice(0, i + 1).join("/"));
    };

    // ── Render ─────────────────────────────────────────────────────

    return (
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`flex-1 min-w-0 min-h-0 bg-bg-secondary border rounded-2xl flex flex-col transition-colors outline-none ${folderSelected ? "border-success/40" : dnd.isDragOver ? "border-accent/40 ring-2 ring-accent/40 bg-accent/5" : "border-border"}`}
        onContextMenu={(e) => {
          e.preventDefault();
          if ((e.target as HTMLElement).closest("table")) return;
          openContextMenu(e, "empty");
        }}
        data-pane-id={paneId ?? undefined}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border shrink-0">
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
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setFilter("");
              e.stopPropagation();
            }}
            placeholder="Filter..."
            className="w-28 px-2 py-1 rounded-lg text-[11px] bg-bg-card border border-border text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 transition-all shrink-0"
          />
          {onSelectFolder && (
            <button
              onClick={() => onSelectFolder(path)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border shrink-0 transition-all ${
                folderSelected
                  ? "bg-success/10 border-success/30 text-success"
                  : "bg-transparent border-border text-text-tertiary hover:border-border-active hover:text-text-secondary"
              }`}
            >
              {folderSelected ? "\u2713 Selected" : "Select"}
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
        {!loading && !error && filteredEntries.length === 0 && !creatingFolder && (
          <CenterMsg>{filter ? "No matches" : "Empty folder"}</CenterMsg>
        )}

        {!loading && !error && (filteredEntries.length > 0 || creatingFolder) && (
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden"
            onMouseDown={(e) => {
              // Prevent text selection on shift-click and right-click without breaking drag
              if (e.shiftKey || e.button === 2) e.preventDefault();
            }}
          >
            <table className="w-full border-collapse table-fixed">
              <thead className="sticky top-0 z-10">
                <tr>
                  <TH className="w-[60%]">Name</TH>
                  <TH className="w-[20%]">Size</TH>
                  <TH className="w-[20%]">Modified</TH>
                </tr>
              </thead>
              <tbody>
                {/* New folder row */}
                {creatingFolder && (
                  <tr>
                    <td colSpan={3} className="px-3 py-[7px] border-b border-border-subtle">
                      <span className="mr-1.5 text-xs align-middle opacity-60">{"\ud83d\udcc1"}</span>
                      <InlineRenameInput
                        initialName="untitled folder"
                        isDir={true}
                        onConfirm={async (name) => {
                          await handleCreateFolder(name);
                          setCreatingFolder(false);
                        }}
                        onCancel={() => setCreatingFolder(false)}
                      />
                    </td>
                  </tr>
                )}

                {flatRows.map(({ entry: e, parentPath: rowPath, depth }) => {
                  const fullPath = joinPath(rowPath, e.name);
                  const rowSelected = isSelected(fullPath);
                  const rowCut = isCut(fullPath);
                  const isFolderDropTarget = e.is_dir && dnd.dropTargetFolder === fullPath;
                  const isExpanded = e.is_dir && expandedFolders.has(fullPath);
                  const isTopLevel = depth === 0;

                  const selectedCell = rowSelected ? "!bg-accent !text-white" : "";

                  return (
                    <tr
                      key={fullPath}
                      data-drop-folder={e.is_dir ? fullPath : undefined}
                      className={`transition-colors group cursor-default ${
                        isFolderDropTarget ? "bg-accent/15" : rowSelected ? "" : "hover:bg-bg-hover/50"
                      } ${rowCut ? "opacity-50" : ""}`}
                      onMouseDown={(ev) => dnd.rowMouseDown(ev, fullPath)}
                      onClick={(ev) => {
                        if (dnd.wasDragging.current) return;
                        handleClick(fullPath, { metaKey: ev.metaKey, shiftKey: ev.shiftKey });
                      }}
                      onDoubleClick={e.is_dir ? () => load(fullPath) : undefined}
                      onContextMenu={(ev) => openContextMenu(ev, "entry", e, fullPath)}
                    >
                      <td
                        className={`py-[7px] pr-3 text-xs border-b border-border-subtle overflow-hidden text-ellipsis whitespace-nowrap ${selectedCell}`}
                        style={{ paddingLeft: `${12 + depth * 20}px` }}
                      >
                        {e.is_dir ? (
                          <span
                            className={`inline-block w-4 text-[10px] cursor-pointer select-none align-middle ${rowSelected ? "text-white/70 hover:text-white" : "text-text-tertiary hover:text-text-secondary"}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggleExpand(fullPath);
                            }}
                          >
                            {isExpanded ? "\u25BE" : "\u25B8"}
                          </span>
                        ) : (
                          <span className="inline-block w-4 align-middle" />
                        )}
                        <span className={`mr-1.5 text-xs align-middle ${rowSelected ? "opacity-90" : "opacity-60"}`}>
                          {icon(e)}
                        </span>
                        {isTopLevel && renamingEntry === e.name ? (
                          <InlineRenameInput
                            initialName={e.name}
                            isDir={e.is_dir}
                            onConfirm={async (newName) => {
                              await handleRename(e.name, newName);
                              setRenamingEntry(null);
                            }}
                            onCancel={() => setRenamingEntry(null)}
                          />
                        ) : e.is_dir ? (
                          <span
                            className={`cursor-pointer transition-colors align-middle ${rowSelected ? "text-white hover:text-white/80" : "text-text-primary hover:text-accent"}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              load(fullPath);
                            }}
                          >
                            {e.name}
                          </span>
                        ) : (
                          <span className={`align-middle ${rowSelected ? "text-white" : "text-text-secondary"}`}>
                            {e.name}
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-[7px] text-xs border-b border-border-subtle ${selectedCell || "text-text-tertiary"}`}
                      >
                        {fmtSize(e.size)}
                      </td>
                      <td
                        className={`px-3 py-[7px] text-xs border-b border-border-subtle ${selectedCell || "text-text-tertiary"}`}
                      >
                        {fmtDate(e.modified)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border text-[11px] text-text-tertiary shrink-0">
          {!loading && !error && (
            <>
              {filteredEntries.filter((e) => e.is_dir).length} folders,{" "}
              {filteredEntries.filter((e) => !e.is_dir).length} files
              {filter && ` (of ${entries.length})`}
              {selected.size > 0 && ` \u2014 ${selected.size} selected`}
            </>
          )}
        </div>

        {ctxMenu && contextMenuItems.length > 0 && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={contextMenuItems} onClose={() => setCtxMenu(null)} />
        )}
      </div>
    );
  },
);

FileExplorer.displayName = "FileExplorer";
