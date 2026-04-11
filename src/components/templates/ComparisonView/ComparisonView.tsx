import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Pill } from "../../atoms/Pill/Pill";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { TreeNodeRow } from "./TreeNodeRow";
import { SyncActions } from "./SyncActions";
import type { ContextMenuItem } from "../../../types/profiles";
import type { CompareEntry, CopyOp, CopyResult, SyncProgress, Filter, TreeNode, ComparisonViewProps } from "./types";
import { buildTree, collectPaths, collectDiffPaths, collectActionableFiles } from "./helpers";
import { FILTERS } from "./constants";

export const ComparisonView = ({ sourcePath, targetPath, exclusions, onAddExclusion, onBack }: ComparisonViewProps) => {
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("differences");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<CopyResult | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderPath: string } | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const compare = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    try {
      const data = await invoke<CompareEntry[]>("compare_directories", { source: sourcePath, target: targetPath });
      setEntries(data);
      const tree = buildTree(data.filter((e) => e.status !== "same"));
      setExpanded(new Set(collectDiffPaths(tree)));
    } catch (e) {
      setError(`${e}`);
    } finally {
      setLoading(false);
    }
  }, [sourcePath, targetPath]);

  useEffect(() => {
    compare();
  }, [compare]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<SyncProgress>("sync-progress", (event) => {
      setProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
      unlistenRef.current = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const visibleEntries = useMemo(() => {
    if (exclusions.length === 0) return entries;
    return entries.filter(
      (e) => !exclusions.some((ex) => e.relative_path === ex || e.relative_path.startsWith(ex + "/")),
    );
  }, [entries, exclusions]);

  const filtered = useMemo(() => {
    if (filter === "all") return visibleEntries;
    if (filter === "differences") return visibleEntries.filter((e) => e.status !== "same");
    return visibleEntries.filter((e) => e.status === filter);
  }, [visibleEntries, filter]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const stats = useMemo(() => {
    const s = { source_only: 0, target_only: 0, modified: 0, same: 0 };
    visibleEntries.forEach((e) => s[e.status]++);
    return s;
  }, [visibleEntries]);

  // ── Selection ──

  const toggle = (p: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });

  const toggleNodeSelection = (node: TreeNode) => {
    const actionable = collectActionableFiles(node);
    const allSelected = actionable.length > 0 && actionable.every((p) => selected.has(p));
    setSelected((prev) => {
      const n = new Set(prev);
      actionable.forEach((p) => (allSelected ? n.delete(p) : n.add(p)));
      return n;
    });
  };

  const selAll = () => setSelected(new Set(filtered.filter((e) => e.status !== "same").map((e) => e.relative_path)));
  const selNone = () => setSelected(new Set());

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  };

  const expandAll = () => setExpanded(new Set(collectPaths(tree)));
  const collapseAll = () => setExpanded(new Set());

  // ── Sync actions ──

  const run = async (fn: () => Promise<void>) => {
    setSyncing(true);
    setResult(null);
    setProgress(null);
    try {
      await fn();
      await compare();
    } catch (e) {
      setError(`${e}`);
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke("cancel_sync");
    } catch (_) {
      /* ignore */
    }
  };

  const copyToTarget = () =>
    run(async () => {
      const ops: CopyOp[] = visibleEntries
        .filter((e) => selected.has(e.relative_path) && (e.status === "source_only" || e.status === "modified"))
        .map((e) => ({
          source_path: `${sourcePath}/${e.relative_path}`,
          dest_path: `${targetPath}/${e.relative_path}`,
        }));
      if (ops.length) setResult(await invoke<CopyResult>("copy_files", { operations: ops }));
    });

  const copyToSource = () =>
    run(async () => {
      const ops: CopyOp[] = visibleEntries
        .filter((e) => selected.has(e.relative_path) && (e.status === "target_only" || e.status === "modified"))
        .map((e) => ({
          source_path: `${targetPath}/${e.relative_path}`,
          dest_path: `${sourcePath}/${e.relative_path}`,
        }));
      if (ops.length) setResult(await invoke<CopyResult>("copy_files", { operations: ops }));
    });

  const deleteTarget = () =>
    run(async () => {
      const paths = visibleEntries
        .filter((e) => selected.has(e.relative_path) && e.status === "target_only")
        .map((e) => `${targetPath}/${e.relative_path}`);
      if (paths.length) setResult(await invoke<CopyResult>("delete_files", { paths }));
    });

  const mirrorToTarget = () =>
    run(async () => {
      const toCopy = visibleEntries.filter((e) => e.status === "source_only" || e.status === "modified");
      const toDelete = visibleEntries.filter((e) => e.status === "target_only");
      const total = toCopy.length + toDelete.length;
      if (total === 0) return;

      let succeeded = 0,
        failed = 0,
        cancelled = false;
      const errors: string[] = [];

      if (toCopy.length > 0) {
        const ops: CopyOp[] = toCopy.map((e) => ({
          source_path: `${sourcePath}/${e.relative_path}`,
          dest_path: `${targetPath}/${e.relative_path}`,
        }));
        const r = await invoke<CopyResult>("copy_files", { operations: ops });
        succeeded += r.succeeded;
        failed += r.failed;
        errors.push(...r.errors);
        if (r.cancelled) {
          setResult({ total, succeeded, failed, cancelled: true, errors });
          return;
        }
      }

      if (toDelete.length > 0) {
        const paths = toDelete.map((e) => `${targetPath}/${e.relative_path}`);
        const r = await invoke<CopyResult>("delete_files", { paths });
        succeeded += r.succeeded;
        failed += r.failed;
        errors.push(...r.errors);
        cancelled = r.cancelled;
      }

      setResult({ total, succeeded, failed, cancelled, errors });
    });

  const nSrc = [...selected].filter((p) => {
    const e = visibleEntries.find((x) => x.relative_path === p);
    return e && (e.status === "source_only" || e.status === "modified");
  }).length;
  const nTgt = [...selected].filter((p) => {
    const e = visibleEntries.find((x) => x.relative_path === p);
    return e && e.status === "target_only";
  }).length;
  const nMirror = stats.source_only + stats.modified + stats.target_only;

  const handleContextMenu = (x: number, y: number, folderPath: string) => {
    setContextMenu({ x, y, folderPath });
  };

  // ── Main render ──

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Header */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-4 py-2.5 shrink-0">
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-xl text-[11px] font-medium shrink-0 hover:bg-bg-hover hover:text-text-primary transition-all"
        >
          &larr; Browse
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden text-[11px]">
          <span className="text-text-tertiary uppercase text-[10px] font-medium tracking-widest shrink-0">Src</span>
          <span className="text-text-secondary font-medium overflow-hidden text-ellipsis whitespace-nowrap">
            {sourcePath}
          </span>
          <span className="text-text-tertiary font-medium shrink-0">vs</span>
          <span className="text-text-tertiary uppercase text-[10px] font-medium tracking-widest shrink-0">iPod</span>
          <span className="text-text-secondary font-medium overflow-hidden text-ellipsis whitespace-nowrap">
            {targetPath}
          </span>
        </div>
        {exclusions.length > 0 && (
          <span className="px-2 py-1 bg-accent/10 border border-accent/20 rounded-lg text-[10px] font-medium text-accent shrink-0">
            {exclusions.length} filtered
          </span>
        )}
        <button
          onClick={compare}
          disabled={loading}
          className="px-2.5 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-xl text-xs shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:bg-bg-hover disabled:opacity-30 transition-all"
        >
          ↻
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-5 px-4 py-2 bg-bg-secondary border border-border rounded-2xl shrink-0 text-[11px] font-medium">
        <span className="text-success">{stats.source_only} new</span>
        <span className="text-warning">{stats.modified} modified</span>
        <span className="text-danger">{stats.target_only} extra</span>
        <span className="text-text-tertiary">{stats.same} matching</span>
      </div>

      {/* Filters + controls */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${filter === f.key ? "bg-bg-card text-text-primary border-border-active" : "bg-transparent text-text-tertiary border-transparent hover:text-text-secondary"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 text-[10px]">
          <Pill onClick={expandAll}>Expand All</Pill>
          <Pill onClick={collapseAll}>Collapse All</Pill>
          <span className="w-px bg-border mx-1" />
          <Pill onClick={selAll}>Select All</Pill>
          <Pill onClick={selNone}>None</Pill>
        </div>
      </div>

      {/* Actions or Progress Bar */}
      <SyncActions
        syncing={syncing}
        progress={progress}
        result={result}
        nSrc={nSrc}
        nTgt={nTgt}
        nMirror={nMirror}
        onMirrorToTarget={mirrorToTarget}
        onCopyToTarget={copyToTarget}
        onCopyToSource={copyToSource}
        onDeleteTarget={deleteTarget}
        onCancel={handleCancel}
      />

      {loading && (
        <div className="py-12 text-center text-text-tertiary text-xs">
          <Spinner />
          Comparing...
        </div>
      )}
      {error && <div className="py-12 text-center text-danger text-xs">{error}</div>}

      {/* Tree view */}
      {!loading && !error && (
        <div className="flex-1 overflow-y-auto bg-bg-secondary border border-border rounded-2xl min-h-0">
          {tree.length === 0 ? (
            <div className="py-12 text-center text-text-tertiary text-xs">
              {filter === "differences" ? "In sync \u2014 no differences found." : "No files match this filter."}
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {tree.map((node) => (
                <TreeNodeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  selected={selected}
                  onToggleExpand={toggleExpand}
                  onToggleNodeSelection={toggleNodeSelection}
                  onToggleFile={toggle}
                  onContextMenu={handleContextMenu}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            [
              {
                label: `Filter out "${contextMenu.folderPath.split("/").pop()}"`,
                onClick: () => onAddExclusion(contextMenu.folderPath),
              },
            ] satisfies ContextMenuItem[]
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
