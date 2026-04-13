import { fmtSize, lastSegment } from "../ComparisonView/helpers";
import { LEFT_CELL_BG, RIGHT_CELL_BG, GHOST_BORDER, GUTTER_ICON } from "./constants";
import type { SplitFileRowProps } from "./types";

export const SplitFileRow = ({ entry, depth, selected, onToggleFile }: SplitFileRowProps) => {
  const name = lastSegment(entry.relative_path);
  const { status } = entry;
  const isActionable = status !== "same";
  const gutter = GUTTER_ICON[status];
  const indent = 40 + depth * 20;

  return (
    <div className="grid grid-cols-[1fr_24px_1fr] hover:bg-bg-hover/30 transition-colors">
      {/* Source (left) cell */}
      <div
        className={`flex items-center gap-2 py-[6px] pr-3 min-w-0 ${
          status === "target_only" ? `${GHOST_BORDER.target_only} opacity-25` : LEFT_CELL_BG[status]
        }`}
        style={{ paddingLeft: `${indent}px` }}
      >
        {/* Checkbox */}
        <div className="w-3 shrink-0 flex justify-center">
          {isActionable && status !== "target_only" ? (
            <input
              type="checkbox"
              checked={selected.has(entry.relative_path)}
              onChange={() => onToggleFile(entry.relative_path)}
              className="w-3 h-3 cursor-pointer accent-accent rounded"
            />
          ) : null}
        </div>

        <span className="text-[11px] text-text-secondary truncate flex-1 min-w-0" title={entry.relative_path}>
          {name}
        </span>
        <span className="text-[10px] text-text-tertiary w-14 text-right shrink-0">{fmtSize(entry.source_size)}</span>
      </div>

      {/* Gutter */}
      <div className="flex items-center justify-center bg-bg-primary/50 border-x border-border-subtle">
        {gutter.icon && <span className={`text-[9px] font-bold ${gutter.color}`}>{gutter.icon}</span>}
      </div>

      {/* Target (right) cell */}
      <div
        className={`flex items-center gap-2 py-[6px] pr-3 min-w-0 ${
          status === "source_only" ? `${GHOST_BORDER.source_only} opacity-25` : RIGHT_CELL_BG[status]
        }`}
        style={{ paddingLeft: "12px" }}
      >
        {/* Checkbox on target side for target_only files */}
        <div className="w-3 shrink-0 flex justify-center">
          {isActionable && status === "target_only" ? (
            <input
              type="checkbox"
              checked={selected.has(entry.relative_path)}
              onChange={() => onToggleFile(entry.relative_path)}
              className="w-3 h-3 cursor-pointer accent-accent rounded"
            />
          ) : null}
        </div>

        <span className="text-[11px] text-text-secondary truncate flex-1 min-w-0" title={entry.relative_path}>
          {name}
        </span>
        <span className="text-[10px] text-text-tertiary w-14 text-right shrink-0">{fmtSize(entry.target_size)}</span>
      </div>
    </div>
  );
};
