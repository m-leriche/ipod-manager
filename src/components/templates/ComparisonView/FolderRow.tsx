import { memo } from "react";
import { STATUS_LABEL, STATUS_COLOR } from "./constants";
import type { Status, FolderRowProps } from "./types";

const SUMMARY_STATUSES: Status[] = ["source_only", "modified", "target_only", "same"];

const FolderRowImpl = ({
  node,
  depth,
  isExpanded,
  allChecked,
  someChecked,
  onToggleExpand,
  onToggleNodeSelection,
  onContextMenu,
}: FolderRowProps) => {
  const hasActionable = node.actionablePaths.length > 0;
  const hasContent = node.files.length > 0 || node.children.length > 0;

  const folderBg =
    node.dominant === "source_only"
      ? "bg-success/[0.03]"
      : node.dominant === "target_only"
        ? "bg-danger/[0.03]"
        : node.dominant === "same"
          ? "opacity-50"
          : "";

  return (
    <div
      className={`flex items-center gap-2.5 py-2 pr-4 cursor-pointer select-none transition-colors hover:bg-bg-hover/50 ${folderBg}`}
      style={{ paddingLeft: `${16 + depth * 24}px` }}
      onClick={() => onToggleExpand(node.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (node.path) onContextMenu(e.clientX, e.clientY, node.path);
      }}
    >
      {/* Checkbox */}
      {hasActionable ? (
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
          onClick={(e) => e.stopPropagation()}
          className="w-3 h-3 cursor-pointer accent-accent rounded shrink-0"
        />
      ) : (
        <div className="w-3 shrink-0" />
      )}

      {/* Chevron */}
      <span
        className={`text-[10px] w-3 shrink-0 transition-transform ${isExpanded ? "text-text-secondary" : "text-text-tertiary"}`}
      >
        {hasContent ? (isExpanded ? "▾" : "▸") : "·"}
      </span>

      {/* Folder icon + name */}
      <span className="text-xs shrink-0 opacity-50">{"📁"}</span>
      <span
        className={`text-[11px] font-medium truncate ${node.hasDifferences ? "text-text-primary" : "text-text-tertiary"}`}
      >
        {node.name}
      </span>

      <div className="flex-1" />

      {/* Summary badges */}
      <div className="flex items-center gap-2 shrink-0">
        {SUMMARY_STATUSES.map((s) =>
          node.totalCounts[s] > 0 ? (
            <span key={s} className={`text-[10px] font-medium ${STATUS_COLOR[s]}`}>
              {node.totalCounts[s]} {STATUS_LABEL[s]}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
};

export const FolderRow = memo(FolderRowImpl);
