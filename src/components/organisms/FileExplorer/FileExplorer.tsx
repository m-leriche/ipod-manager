import { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProgress } from "../../../contexts/ProgressContext";
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

    const containerRef = useRef<HTMLDivElement>(null);
    const pathRef = useRef(path);
    pathRef.current = path;

    const { selected, handleClick, selectAll, clearSelection, isSelected } = useFileSelection(entries);
    const { clipboard, copy, cut, clear: clearClipboard, isCut } = useClipboard();
    const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();

    const load = useCallback(async (p: string) => {
      setLoading(true);
      setError(null);
      setRenamingEntry(null);
      setCreatingFolder(false);
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
        startProgress(`${action} ${label}...`, () => invoke("cancel_sync"));

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

    const into = (name: string) => load(joinPath(path, name));

    const up = () => {
      if (!allowParentNavigation && path === rootPath) return;
      if (path === "/") return;
      const parent = path.substring(0, path.lastIndexOf("/")) || "/";
      load(!allowParentNavigation && !parent.startsWith(rootPath) ? rootPath : parent);
    };

    // ── Clipboard actions ──────────────────────────────────────────

    const selectedPaths = useMemo(() => [...selected].map((name) => joinPath(path, name)), [selected, path]);

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
      if (selected.size > 0 && allowDelete) handleDelete([...selected]);
    }, [selected, allowDelete, handleDelete]);

    const handleRenameAction = useCallback(() => {
      if (selected.size === 1) setRenamingEntry([...selected][0]);
    }, [selected]);

    const handleNewFolder = useCallback(() => {
      setCreatingFolder(true);
    }, []);

    const handleEnter = useCallback(() => {
      if (selected.size !== 1) return;
      const name = [...selected][0];
      const entry = entries.find((e) => e.name === name);
      if (entry?.is_dir) {
        into(name);
      } else {
        setRenamingEntry(name);
      }
    }, [selected, entries]);

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

    const openContextMenu = (e: React.MouseEvent, target: "entry" | "empty", entry?: FileEntry) => {
      e.preventDefault();
      if (target === "entry" && entry && !isSelected(entry.name)) {
        handleClick(entry.name, { metaKey: false, shiftKey: false });
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
          if ((e.target as HTMLElement).closest("table")) return;
          openContextMenu(e, "empty");
        }}
        {...dnd.containerHandlers}
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
        {!loading && !error && entries.length === 0 && !creatingFolder && <CenterMsg>Empty folder</CenterMsg>}

        {!loading && !error && (entries.length > 0 || creatingFolder) && (
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

                {entries.map((e) => {
                  const rowSelected = isSelected(e.name);
                  const rowCut = isCut(joinPath(path, e.name));
                  const isFolderDropTarget = e.is_dir && dnd.dropTargetFolder === joinPath(path, e.name);
                  const folderDnd = e.is_dir && paneId ? dnd.folderHandlers(e) : undefined;

                  return (
                    <tr
                      key={e.name}
                      draggable={!!paneId}
                      onDragStart={(ev) => dnd.rowDragStart(ev, e)}
                      {...folderDnd}
                      className={`transition-colors group cursor-default ${
                        isFolderDropTarget ? "bg-accent/15" : rowSelected ? "bg-accent/10" : "hover:bg-bg-hover/50"
                      } ${rowCut ? "opacity-50" : ""}`}
                      onClick={(ev) => handleClick(e.name, { metaKey: ev.metaKey, shiftKey: ev.shiftKey })}
                      onDoubleClick={() => e.is_dir && into(e.name)}
                      onContextMenu={(ev) => openContextMenu(ev, "entry", e)}
                    >
                      <td className="px-3 py-[7px] text-xs border-b border-border-subtle overflow-hidden text-ellipsis whitespace-nowrap">
                        <span className="mr-1.5 text-xs align-middle opacity-60">{icon(e)}</span>
                        {renamingEntry === e.name ? (
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
                            className="cursor-pointer text-text-primary hover:text-accent transition-colors align-middle"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              into(e.name);
                            }}
                          >
                            {e.name}
                          </span>
                        ) : (
                          <span className="text-text-secondary align-middle">{e.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-[7px] text-xs text-text-tertiary border-b border-border-subtle">
                        {fmtSize(e.size)}
                      </td>
                      <td className="px-3 py-[7px] text-xs text-text-tertiary border-b border-border-subtle">
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
              {entries.filter((e) => e.is_dir).length} folders, {entries.filter((e) => !e.is_dir).length} files
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
