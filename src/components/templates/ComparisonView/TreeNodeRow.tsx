import { collectActionableFiles } from "./helpers";
import { STATUS_ICON, STATUS_BADGE, STATUS_LABEL, STATUS_COLOR, FILE_ROW_BG } from "./constants";
import { fmtSize, lastSegment } from "./helpers";
import type { Status, TreeNodeRowProps } from "./types";

export const TreeNodeRow = ({
  node,
  depth,
  expanded,
  selected,
  onToggleExpand,
  onToggleNodeSelection,
  onToggleFile,
  onContextMenu,
}: TreeNodeRowProps) => {
  const isExpanded = expanded.has(node.path);
  const actionable = collectActionableFiles(node);
  const allChecked = actionable.length > 0 && actionable.every((p) => selected.has(p));
  const someChecked = actionable.some((p) => selected.has(p));
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
    <div key={node.path}>
      {/* Folder row */}
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
        {actionable.length > 0 ? (
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
          {hasContent ? (isExpanded ? "\u25be" : "\u25b8") : "\u00b7"}
        </span>

        {/* Folder icon + name */}
        <span className="text-xs shrink-0 opacity-50">{"\ud83d\udcc1"}</span>
        <span
          className={`text-[11px] font-medium truncate ${node.hasDifferences ? "text-text-primary" : "text-text-tertiary"}`}
        >
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
            ) : null,
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          {/* Child folders (recursive) */}
          {node.children.map((child) => (
            <TreeNodeRow
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

          {/* Direct files in this folder */}
          {node.files.map((entry) => (
            <div
              key={entry.relative_path}
              className={`flex items-center gap-2.5 py-[6px] pr-4 transition-colors ${FILE_ROW_BG[entry.status]}`}
              style={{ paddingLeft: `${40 + depth * 24}px` }}
            >
              {/* Checkbox */}
              <div className="w-3 shrink-0 flex justify-center">
                {entry.status !== "same" ? (
                  <input
                    type="checkbox"
                    checked={selected.has(entry.relative_path)}
                    onChange={() => onToggleFile(entry.relative_path)}
                    className="w-3 h-3 cursor-pointer accent-accent rounded"
                  />
                ) : null}
              </div>

              {/* Status badge */}
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0 ${STATUS_BADGE[entry.status]}`}
              >
                {STATUS_ICON[entry.status]}
              </span>

              {/* Filename */}
              <span className="text-[11px] text-text-secondary flex-1 min-w-0 truncate" title={entry.relative_path}>
                {lastSegment(entry.relative_path)}
              </span>

              {/* Sizes */}
              <span className="text-[10px] text-text-tertiary w-16 text-right shrink-0">
                {fmtSize(entry.source_size)}
              </span>
              <span className="text-[10px] text-text-tertiary w-16 text-right shrink-0">
                {fmtSize(entry.target_size)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
