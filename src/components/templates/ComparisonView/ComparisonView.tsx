import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Pill } from "../../atoms/Pill/Pill";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { FolderRow } from "./FolderRow";
import { FileRow } from "./FileRow";
import { SyncActions } from "./SyncActions";
import { useComparison } from "./useComparison";
import { useSync } from "./useSync";
import { useTreeSelection, useTreeExpansion } from "./useTreeSelection";
import { flattenTree } from "./helpers";
import type { ContextMenuItem } from "../../molecules/ContextMenu/types";
import type { ComparisonViewProps } from "./types";
import { FILTERS } from "./constants";

export const ComparisonView = ({ sourcePath, targetPath, exclusions, onAddExclusion, onBack }: ComparisonViewProps) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderPath: string } | null>(null);

  const { expanded, setExpanded, toggleExpand, expandAll, collapseAll } = useTreeExpansion();

  const onCompared = useCallback(
    (newExpanded: Set<string>) => {
      setExpanded(newExpanded);
    },
    [setExpanded],
  );

  const { loading, error, setError, filter, setFilter, compare, visibleEntries, filtered, tree, entryMap, stats } =
    useComparison(sourcePath, targetPath, exclusions, onCompared);

  const { selected, toggle, toggleNodeSelection, selAll, selNone, reset: resetSelection } = useTreeSelection(filtered);

  const resetAndCompare = useCallback(async () => {
    resetSelection();
    await compare();
  }, [compare, resetSelection]);

  const { syncing, progress, result, handleCancel, copyToTarget, copyToSource, deleteTarget, mirrorToTarget } = useSync(
    sourcePath,
    targetPath,
    visibleEntries,
    selected,
    resetAndCompare,
    setError,
  );

  const nSrc = [...selected].filter((p) => {
    const e = entryMap.get(p);
    return e && (e.status === "source_only" || e.status === "modified");
  }).length;
  const nTgt = [...selected].filter((p) => {
    const e = entryMap.get(p);
    return e && e.status === "target_only";
  }).length;
  const nMirror = stats.source_only + stats.modified + stats.target_only;

  // Flatten the visible tree once per tree/expansion change, then virtualize so
  // only on-screen rows render — a large sync tree can be tens of thousands.
  const flatRows = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 15,
    // Key measurements by content, not index, so a row's measured height
    // travels with it when expand/collapse/filter reshuffles the flat list.
    getItemKey: (index) => {
      const row = flatRows[index];
      return row.kind === "folder" ? `f:${row.node.path}` : `e:${row.entry.relative_path}`;
    },
  });

  const handleContextMenu = useCallback(
    (x: number, y: number, folderPath: string) => setContextMenu({ x, y, folderPath }),
    [],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
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
      <div className="flex gap-5 px-5 py-2.5 bg-bg-secondary border border-border rounded-2xl shrink-0 text-xs font-medium">
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
          <Pill onClick={() => expandAll(tree)}>Expand All</Pill>
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

      {loading && <div className="py-12 shrink-0" />}
      {error && <div className="py-12 text-center text-danger text-xs shrink-0">{error}</div>}

      {/* Tree view */}
      {!loading && !error && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-bg-secondary border border-border rounded-2xl min-h-0"
        >
          {flatRows.length === 0 ? (
            <div className="py-12 text-center text-text-tertiary text-xs">
              {filter === "differences" ? "In sync \u2014 no differences found." : "No files match this filter."}
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const row = flatRows[vi.index];
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="border-b border-border-subtle"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    {row.kind === "folder" ? (
                      <FolderRow
                        node={row.node}
                        depth={row.depth}
                        isExpanded={expanded.has(row.node.path)}
                        allChecked={
                          row.node.actionablePaths.length > 0 && row.node.actionablePaths.every((p) => selected.has(p))
                        }
                        someChecked={row.node.actionablePaths.some((p) => selected.has(p))}
                        onToggleExpand={toggleExpand}
                        onToggleNodeSelection={toggleNodeSelection}
                        onContextMenu={handleContextMenu}
                      />
                    ) : (
                      <FileRow
                        entry={row.entry}
                        depth={row.depth}
                        isSelected={selected.has(row.entry.relative_path)}
                        onToggleFile={toggle}
                      />
                    )}
                  </div>
                );
              })}
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
