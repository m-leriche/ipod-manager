import { collectActionableFiles } from "../ComparisonView/helpers";
import { STATUS_COLOR, STATUS_LABEL } from "../ComparisonView/constants";
import type { Status } from "../ComparisonView/types";
import { SplitFileRow } from "./SplitFileRow";
import type { SplitTreeNodeRowProps } from "./types";

const SOURCE_STATUSES: Status[] = ["source_only", "modified"];
const TARGET_STATUSES: Status[] = ["target_only", "modified", "same"];

export const SplitTreeNodeRow = ({
  node,
  depth,
  expanded,
  selected,
  onToggleExpand,
  onToggleNodeSelection,
  onToggleFile,
  onContextMenu,
}: SplitTreeNodeRowProps) => {
  const isExpanded = expanded.has(node.path);
  const hasContent = node.files.length > 0 || node.children.length > 0;

  const actionable = collectActionableFiles(node);
  const allChecked = actionable.length > 0 && actionable.every((p) => selected.has(p));
  const someChecked = actionable.some((p) => selected.has(p));

  const folderBg =
    node.dominant === "source_only"
      ? "bg-success/[0.03]"
      : node.dominant === "target_only"
        ? "bg-danger/[0.03]"
        : node.dominant === "same"
          ? "opacity-50"
          : "";

  const indent = 16 + depth * 20;

  return (
    <div>
      {/* Folder row */}
      <div
        className={`grid grid-cols-[1fr_24px_1fr] cursor-pointer select-none transition-colors hover:bg-bg-hover/50 ${folderBg}`}
        onClick={() => onToggleExpand(node.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (node.path) onContextMenu(e.clientX, e.clientY, node.path);
        }}
      >
        {/* Left: source-side folder info */}
        <div className="flex items-center gap-2 py-2 pr-3" style={{ paddingLeft: `${indent}px` }}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked && !allChecked;
            }}
            onChange={(e) => {
              e.stopPropagation();
              onToggleNodeSelection(node);
            }}
            className="w-3 h-3 cursor-pointer accent-accent rounded shrink-0"
          />
          <span
            className={`text-[10px] w-3 shrink-0 transition-transform ${isExpanded ? "text-text-secondary" : "text-text-tertiary"}`}
          >
            {hasContent ? (isExpanded ? "\u25BE" : "\u25B8") : "\u00B7"}
          </span>
          <span className="text-xs shrink-0 opacity-50">&#128193;</span>
          <span
            className={`text-[11px] font-medium truncate ${node.hasDifferences ? "text-text-primary" : "text-text-tertiary"}`}
          >
            {node.name}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 shrink-0">
            {SOURCE_STATUSES.map((s) =>
              node.totalCounts[s] > 0 ? (
                <span key={s} className={`text-[10px] font-medium ${STATUS_COLOR[s]}`}>
                  {node.totalCounts[s]} {STATUS_LABEL[s]}
                </span>
              ) : null,
            )}
          </div>
        </div>

        {/* Gutter */}
        <div className="bg-bg-primary/50 border-x border-border-subtle" />

        {/* Right: target-side folder info */}
        <div className="flex items-center gap-2 py-2 pr-3 pl-3">
          <span className="text-xs shrink-0 opacity-50">&#128193;</span>
          <span
            className={`text-[11px] font-medium truncate ${node.hasDifferences ? "text-text-primary" : "text-text-tertiary"}`}
          >
            {node.name}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 shrink-0">
            {TARGET_STATUSES.map((s) =>
              node.totalCounts[s] > 0 ? (
                <span key={s} className={`text-[10px] font-medium ${STATUS_COLOR[s]}`}>
                  {node.totalCounts[s]} {STATUS_LABEL[s]}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Expanded children */}
      {isExpanded && (
        <>
          {node.files.map((entry) => (
            <SplitFileRow
              key={entry.relative_path}
              entry={entry}
              depth={depth + 1}
              selected={selected}
              onToggleFile={onToggleFile}
            />
          ))}
          {node.children.map((child) => (
            <SplitTreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              onToggleExpand={onToggleExpand}
              onToggleNodeSelection={onToggleNodeSelection}
              onToggleFile={onToggleFile}
              onContextMenu={onContextMenu}
            />
          ))}
        </>
      )}
    </div>
  );
};
