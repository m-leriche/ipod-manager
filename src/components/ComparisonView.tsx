import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Pill } from "./atoms/Pill";
import { Spinner } from "./atoms/Spinner";
import { ContextMenu } from "./molecules/ContextMenu";
import type { ContextMenuItem } from "../types/profiles";

// ── Types ──────────────────────────────────────────────────────────

interface CompareEntry {
  relative_path: string;
  is_dir: boolean;
  source_size: number | null;
  target_size: number | null;
  source_modified: number | null;
  target_modified: number | null;
  status: "source_only" | "target_only" | "modified" | "same";
}

interface CopyOp { source_path: string; dest_path: string; }
interface CopyResult { total: number; succeeded: number; failed: number; cancelled: boolean; errors: string[]; }

interface SyncProgress {
  total: number;
  completed: number;
  current_file: string;
  phase: string;
}
type Filter = "all" | "differences" | "source_only" | "target_only" | "modified" | "same";
type Status = CompareEntry["status"];

/** A node in the folder tree. Can contain files and child folders. */
interface TreeNode {
  name: string;        // Just this segment, e.g. "Album1"
  path: string;        // Full relative folder path, e.g. "1Man/Album1"
  files: CompareEntry[];
  children: TreeNode[];
  // Aggregated counts across ALL descendants (not just direct files)
  totalCounts: Record<Status, number>;
  totalFiles: number;
  hasDifferences: boolean;
  dominant: Status | "mixed";
}

interface Props {
  sourcePath: string;
  targetPath: string;
  exclusions: string[];
  onAddExclusion: (path: string) => void;
  onBack: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────

function fmtSize(b: number | null): string {
  if (b === null || b === 0) return "\u2014";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function lastSegment(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

const STATUS_ICON: Record<string, string> = { source_only: "\u2192", target_only: "\u2190", modified: "\u2260", same: "=" };
const STATUS_BADGE: Record<string, string> = {
  source_only: "bg-success/15 text-success",
  target_only: "bg-danger/15 text-danger",
  modified: "bg-warning/15 text-warning",
  same: "bg-text-tertiary/10 text-text-tertiary",
};
const STATUS_LABEL: Record<string, string> = { source_only: "new", target_only: "extra", modified: "modified", same: "matching" };
const STATUS_COLOR: Record<string, string> = { source_only: "text-success", target_only: "text-danger", modified: "text-warning", same: "text-text-tertiary" };

const FILE_ROW_BG: Record<string, string> = {
  source_only: "bg-success/[0.03] hover:bg-success/[0.07]",
  target_only: "bg-danger/[0.03] hover:bg-danger/[0.07]",
  modified: "bg-warning/[0.03] hover:bg-warning/[0.07]",
  same: "opacity-40",
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: "differences", label: "Differences" },
  { key: "all", label: "All" },
  { key: "source_only", label: "New" },
  { key: "target_only", label: "Extra" },
  { key: "modified", label: "Modified" },
  { key: "same", label: "Matching" },
];

// ── Tree building ──────────────────────────────────────────────────

function buildTree(entries: CompareEntry[]): TreeNode[] {
  // Group files by their folder path
  const folderMap = new Map<string, CompareEntry[]>();
  for (const e of entries) {
    const lastSlash = e.relative_path.lastIndexOf("/");
    const folder = lastSlash >= 0 ? e.relative_path.slice(0, lastSlash) : "";
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder)!.push(e);
  }

  // Build a nested map of folder segments
  interface RawNode {
    children: Map<string, RawNode>;
    files: CompareEntry[];
    fullPath: string;
  }

  const root: RawNode = { children: new Map(), files: [], fullPath: "" };

  for (const [folderPath, files] of folderMap) {
    let current = root;
    if (folderPath === "") {
      current.files.push(...files);
    } else {
      const parts = folderPath.split("/");
      let built = "";
      for (const part of parts) {
        built = built ? `${built}/${part}` : part;
        if (!current.children.has(part)) {
          current.children.set(part, { children: new Map(), files: [], fullPath: built });
        }
        current = current.children.get(part)!;
      }
      current.files.push(...files);
    }
  }

  // Convert RawNode tree to TreeNode tree with aggregated counts
  function convert(raw: RawNode, name: string): TreeNode {
    const children: TreeNode[] = [];
    for (const [childName, childRaw] of [...raw.children.entries()].sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))) {
      children.push(convert(childRaw, childName));
    }

    raw.files.sort((a, b) => lastSegment(a.relative_path).toLowerCase().localeCompare(lastSegment(b.relative_path).toLowerCase()));

    // Aggregate counts: own files + all descendant counts
    const totalCounts: Record<Status, number> = { source_only: 0, target_only: 0, modified: 0, same: 0 };
    let totalFiles = 0;

    for (const f of raw.files) { totalCounts[f.status]++; totalFiles++; }
    for (const c of children) {
      for (const s of Object.keys(totalCounts) as Status[]) totalCounts[s] += c.totalCounts[s];
      totalFiles += c.totalFiles;
    }

    const hasDifferences = totalCounts.source_only > 0 || totalCounts.target_only > 0 || totalCounts.modified > 0;
    const statuses = (Object.keys(totalCounts) as Status[]).filter((s) => totalCounts[s] > 0);
    const dominant: Status | "mixed" = statuses.length === 1 ? statuses[0] : "mixed";

    return { name, path: raw.fullPath, files: raw.files, children, totalCounts, totalFiles, hasDifferences, dominant };
  }

  // If root has direct files and children, return root's children + a virtual "(root)" node for root-level files
  const treeChildren: TreeNode[] = [];
  for (const [childName, childRaw] of [...root.children.entries()].sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))) {
    treeChildren.push(convert(childRaw, childName));
  }
  if (root.files.length > 0) {
    const rootCounts: Record<Status, number> = { source_only: 0, target_only: 0, modified: 0, same: 0 };
    for (const f of root.files) rootCounts[f.status]++;
    const hasDiff = rootCounts.source_only > 0 || rootCounts.target_only > 0 || rootCounts.modified > 0;
    const sts = (Object.keys(rootCounts) as Status[]).filter((s) => rootCounts[s] > 0);
    treeChildren.unshift({
      name: "(root files)", path: "", files: root.files, children: [],
      totalCounts: rootCounts, totalFiles: root.files.length,
      hasDifferences: hasDiff, dominant: sts.length === 1 ? sts[0] : "mixed",
    });
  }

  return treeChildren;
}

/** Collect all folder paths in a tree */
function collectPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const n of nodes) {
    paths.push(n.path);
    paths.push(...collectPaths(n.children));
  }
  return paths;
}

/** Collect paths of nodes that have differences */
function collectDiffPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const n of nodes) {
    if (n.hasDifferences) {
      paths.push(n.path);
      paths.push(...collectDiffPaths(n.children));
    }
  }
  return paths;
}

/** Collect all actionable file paths under a node (recursively) */
function collectActionableFiles(node: TreeNode): string[] {
  const paths: string[] = [];
  for (const f of node.files) if (f.status !== "same") paths.push(f.relative_path);
  for (const c of node.children) paths.push(...collectActionableFiles(c));
  return paths;
}

// ── Component ──────────────────────────────────────────────────────

export function ComparisonView({ sourcePath, targetPath, exclusions, onAddExclusion, onBack }: Props) {
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
    setLoading(true); setError(null); setResult(null); setSelected(new Set());
    try {
      const data = await invoke<CompareEntry[]>("compare_directories", { source: sourcePath, target: targetPath });
      setEntries(data);
      const tree = buildTree(data.filter((e) => e.status !== "same"));
      setExpanded(new Set(collectDiffPaths(tree)));
    } catch (e) { setError(`${e}`); }
    finally { setLoading(false); }
  }, [sourcePath, targetPath]);

  useEffect(() => { compare(); }, [compare]);

  // Listen for sync progress events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<SyncProgress>("sync-progress", (event) => {
      setProgress(event.payload);
    }).then((fn) => { unlisten = fn; unlistenRef.current = fn; });
    return () => { unlisten?.(); };
  }, []);

  // Apply exclusions client-side so adding a filter doesn't re-fetch
  const visibleEntries = useMemo(() => {
    if (exclusions.length === 0) return entries;
    return entries.filter((e) => !exclusions.some((ex) => e.relative_path === ex || e.relative_path.startsWith(ex + "/")));
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
  }, [entries]);

  // ── Selection ──

  const toggle = (p: string) => setSelected((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const toggleNodeSelection = (node: TreeNode) => {
    const actionable = collectActionableFiles(node);
    const allSelected = actionable.length > 0 && actionable.every((p) => selected.has(p));
    setSelected((prev) => {
      const n = new Set(prev);
      actionable.forEach((p) => allSelected ? n.delete(p) : n.add(p));
      return n;
    });
  };

  const selAll = () => setSelected(new Set(filtered.filter((e) => e.status !== "same").map((e) => e.relative_path)));
  const selNone = () => setSelected(new Set());

  const toggleExpand = (path: string) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; });
  };

  const expandAll = () => setExpanded(new Set(collectPaths(tree)));
  const collapseAll = () => setExpanded(new Set());

  // ── Sync actions ──

  const run = async (fn: () => Promise<void>) => {
    setSyncing(true); setResult(null); setProgress(null);
    try { await fn(); await compare(); }
    catch (e) { setError(`${e}`); }
    finally { setSyncing(false); setProgress(null); }
  };

  const handleCancel = async () => {
    try { await invoke("cancel_sync"); }
    catch (_) { /* ignore */ }
  };

  const copyToTarget = () => run(async () => {
    const ops: CopyOp[] = visibleEntries.filter((e) => selected.has(e.relative_path) && (e.status === "source_only" || e.status === "modified"))
      .map((e) => ({ source_path: `${sourcePath}/${e.relative_path}`, dest_path: `${targetPath}/${e.relative_path}` }));
    if (ops.length) setResult(await invoke<CopyResult>("copy_files", { operations: ops }));
  });

  const copyToSource = () => run(async () => {
    const ops: CopyOp[] = visibleEntries.filter((e) => selected.has(e.relative_path) && (e.status === "target_only" || e.status === "modified"))
      .map((e) => ({ source_path: `${targetPath}/${e.relative_path}`, dest_path: `${sourcePath}/${e.relative_path}` }));
    if (ops.length) setResult(await invoke<CopyResult>("copy_files", { operations: ops }));
  });

  const deleteTarget = () => run(async () => {
    const paths = visibleEntries.filter((e) => selected.has(e.relative_path) && e.status === "target_only").map((e) => `${targetPath}/${e.relative_path}`);
    if (paths.length) setResult(await invoke<CopyResult>("delete_files", { paths }));
  });

  const mirrorToTarget = () => run(async () => {
    const toCopy = visibleEntries.filter((e) => e.status === "source_only" || e.status === "modified");
    const toDelete = visibleEntries.filter((e) => e.status === "target_only");
    const total = toCopy.length + toDelete.length;
    if (total === 0) return;

    let succeeded = 0, failed = 0, cancelled = false;
    const errors: string[] = [];

    if (toCopy.length > 0) {
      const ops: CopyOp[] = toCopy.map((e) => ({
        source_path: `${sourcePath}/${e.relative_path}`,
        dest_path: `${targetPath}/${e.relative_path}`,
      }));
      const r = await invoke<CopyResult>("copy_files", { operations: ops });
      succeeded += r.succeeded; failed += r.failed; errors.push(...r.errors);
      if (r.cancelled) { setResult({ total, succeeded, failed, cancelled: true, errors }); return; }
    }

    if (toDelete.length > 0) {
      const paths = toDelete.map((e) => `${targetPath}/${e.relative_path}`);
      const r = await invoke<CopyResult>("delete_files", { paths });
      succeeded += r.succeeded; failed += r.failed; errors.push(...r.errors); cancelled = r.cancelled;
    }

    setResult({ total, succeeded, failed, cancelled, errors });
  });

  const nSrc = [...selected].filter((p) => { const e = visibleEntries.find((x) => x.relative_path === p); return e && (e.status === "source_only" || e.status === "modified"); }).length;
  const nTgt = [...selected].filter((p) => { const e = visibleEntries.find((x) => x.relative_path === p); return e && e.status === "target_only"; }).length;
  const nMirror = stats.source_only + stats.modified + stats.target_only;

  // ── Render a tree node recursively ──

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expanded.has(node.path);
    const actionable = collectActionableFiles(node);
    const allChecked = actionable.length > 0 && actionable.every((p) => selected.has(p));
    const someChecked = actionable.some((p) => selected.has(p));
    const hasContent = node.files.length > 0 || node.children.length > 0;

    // Determine folder tint
    const folderBg = node.dominant === "source_only" ? "bg-success/[0.03]"
      : node.dominant === "target_only" ? "bg-danger/[0.03]"
      : node.dominant === "same" ? "opacity-50"
      : "";

    return (
      <div key={node.path}>
        {/* Folder row */}
        <div
          className={`flex items-center gap-2 py-1.5 pr-3 cursor-pointer select-none transition-colors hover:bg-bg-hover/50 ${folderBg}`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => toggleExpand(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (node.path) setContextMenu({ x: e.clientX, y: e.clientY, folderPath: node.path });
          }}
        >
          {/* Checkbox */}
          {actionable.length > 0 ? (
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
              onChange={(e) => { e.stopPropagation(); toggleNodeSelection(node); }}
              onClick={(e) => e.stopPropagation()}
              className="w-3 h-3 cursor-pointer accent-accent rounded shrink-0"
            />
          ) : (
            <div className="w-3 shrink-0" />
          )}

          {/* Chevron */}
          <span className={`text-[10px] w-3 shrink-0 transition-transform ${isExpanded ? "text-text-secondary" : "text-text-tertiary"}`}>
            {hasContent ? (isExpanded ? "\u25be" : "\u25b8") : "\u00b7"}
          </span>

          {/* Folder icon + name */}
          <span className="text-xs shrink-0 opacity-50">{"\ud83d\udcc1"}</span>
          <span className={`text-[11px] font-medium truncate ${node.hasDifferences ? "text-text-primary" : "text-text-tertiary"}`}>
            {node.name}
          </span>

          <div className="flex-1" />

          {/* Summary badges */}
          <div className="flex items-center gap-2 shrink-0">
            {(["source_only", "modified", "target_only", "same"] as Status[]).map((s) =>
              node.totalCounts[s] > 0 ? (
                <span key={s} className={`text-[10px] font-medium ${STATUS_COLOR[s]}`}>
                  {node.totalCounts[s]} {STATUS_LABEL[s]}
                </span>
              ) : null
            )}
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <>
            {/* Child folders (recursive) */}
            {node.children.map((child) => renderNode(child, depth + 1))}

            {/* Direct files in this folder */}
            {node.files.map((entry) => (
              <div
                key={entry.relative_path}
                className={`flex items-center gap-2 py-[4px] pr-3 transition-colors ${FILE_ROW_BG[entry.status]}`}
                style={{ paddingLeft: `${32 + depth * 20}px` }}
              >
                {/* Checkbox */}
                <div className="w-3 shrink-0 flex justify-center">
                  {entry.status !== "same" ? (
                    <input type="checkbox" checked={selected.has(entry.relative_path)} onChange={() => toggle(entry.relative_path)}
                      className="w-3 h-3 cursor-pointer accent-accent rounded" />
                  ) : null}
                </div>

                {/* Status badge */}
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0 ${STATUS_BADGE[entry.status]}`}>
                  {STATUS_ICON[entry.status]}
                </span>

                {/* Filename */}
                <span className="text-[11px] text-text-secondary flex-1 min-w-0 truncate" title={entry.relative_path}>
                  {lastSegment(entry.relative_path)}
                </span>

                {/* Sizes */}
                <span className="text-[10px] text-text-tertiary w-16 text-right shrink-0">{fmtSize(entry.source_size)}</span>
                <span className="text-[10px] text-text-tertiary w-16 text-right shrink-0">{fmtSize(entry.target_size)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  // ── Main render ──

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Header */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-4 py-2.5 shrink-0">
        <button onClick={onBack} className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-xl text-[11px] font-medium shrink-0 hover:bg-bg-hover hover:text-text-primary transition-all">
          &larr; Browse
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden text-[11px]">
          <span className="text-text-tertiary uppercase text-[10px] font-medium tracking-widest shrink-0">Src</span>
          <span className="text-text-secondary font-medium overflow-hidden text-ellipsis whitespace-nowrap">{sourcePath}</span>
          <span className="text-text-tertiary font-medium shrink-0">vs</span>
          <span className="text-text-tertiary uppercase text-[10px] font-medium tracking-widest shrink-0">iPod</span>
          <span className="text-text-secondary font-medium overflow-hidden text-ellipsis whitespace-nowrap">{targetPath}</span>
        </div>
        {exclusions.length > 0 && (
          <span className="px-2 py-1 bg-accent/10 border border-accent/20 rounded-lg text-[10px] font-medium text-accent shrink-0">
            {exclusions.length} filtered
          </span>
        )}
        <button onClick={compare} disabled={loading} className="px-2.5 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-xl text-xs shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:bg-bg-hover disabled:opacity-30 transition-all">↻</button>
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
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${filter === f.key ? "bg-bg-card text-text-primary border-border-active" : "bg-transparent text-text-tertiary border-transparent hover:text-text-secondary"}`}>
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
      {syncing && progress ? (
        <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-text-primary">
              {progress.phase === "copying" ? "Copying" : progress.phase === "deleting" ? "Deleting" : "Finishing"}...
            </span>
            <span className="text-[11px] text-text-secondary">
              {progress.completed} of {progress.total} files
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-text-primary rounded-full transition-all duration-200"
              style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary truncate flex-1 min-w-0 mr-3">
              {progress.current_file || "Finishing up..."}
            </span>
            <button
              onClick={handleCancel}
              className="px-3 py-1 bg-transparent border border-danger/30 text-danger rounded-lg text-[10px] font-medium shrink-0 hover:bg-danger/10 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 shrink-0">
          <button disabled={syncing || nMirror === 0} onClick={mirrorToTarget}
            className="flex-1 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed">
            Mirror {nMirror} to iPod {"\u2192"}
          </button>
          <button disabled={syncing || nSrc === 0} onClick={copyToTarget}
            className="py-2 px-4 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed">
            Copy {nSrc} {"\u2192"}
          </button>
          <button disabled={syncing || nTgt === 0} onClick={copyToSource}
            className="py-2 px-4 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed">
            {"\u2190"} Copy {nTgt}
          </button>
          <button disabled={syncing || nTgt === 0} onClick={deleteTarget}
            className="py-2 px-4 bg-transparent border border-danger/30 text-danger rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-danger/10 disabled:opacity-20 disabled:cursor-not-allowed">
            Delete {nTgt}
          </button>
        </div>
      )}

      {/* Result toast */}
      {result && !syncing && (
        <div className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed ${result.failed || result.cancelled ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
          {result.cancelled
            ? `Cancelled: ${result.succeeded} of ${result.total} completed`
            : `${result.succeeded}/${result.total} completed`}
          {result.failed > 0 && `. ${result.failed} failed.`}
          {result.errors.length > 0 && <div className="mt-1 text-[10px] opacity-70">{result.errors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}</div>}
        </div>
      )}

      {loading && <div className="py-12 text-center text-text-tertiary text-xs"><Spinner />Comparing...</div>}
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
              {tree.map((node) => renderNode(node, 0))}
            </div>
          )}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: `Filter out "${contextMenu.folderPath.split("/").pop()}"`,
              onClick: () => onAddExclusion(contextMenu.folderPath),
            },
          ] satisfies ContextMenuItem[]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

