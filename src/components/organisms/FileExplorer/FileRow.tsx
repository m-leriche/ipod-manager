import { InlineRenameInput } from "./InlineRenameInput";
import { fmtSize, fmtDate, icon } from "./helpers";
import type { FileEntry } from "./types";

interface FileRowProps {
  entry: FileEntry;
  fullPath: string;
  depth: number;
  isSelected: boolean;
  isCut: boolean;
  isFolderDropTarget: boolean;
  isExpanded: boolean;
  isRenaming: boolean;
  onMouseDown: (ev: React.MouseEvent) => void;
  onClick: (ev: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onContextMenu: (ev: React.MouseEvent) => void;
  onToggleExpand: () => void;
  onNavigate: () => void;
  onRenameConfirm: (newName: string) => Promise<void>;
  onRenameCancel: () => void;
}

export const FileRow = ({
  entry,
  fullPath,
  depth,
  isSelected,
  isCut,
  isFolderDropTarget,
  isExpanded,
  isRenaming,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleExpand,
  onNavigate,
  onRenameConfirm,
  onRenameCancel,
}: FileRowProps) => {
  const selectedCell = isSelected ? "!bg-accent !text-white" : "";

  return (
    <tr
      data-drop-folder={entry.is_dir ? fullPath : undefined}
      className={`transition-colors group cursor-default ${
        isFolderDropTarget ? "bg-accent/15" : isSelected ? "" : "hover:bg-bg-hover/50"
      } ${isCut ? "opacity-50" : ""}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <td
        className={`py-[7px] pr-3 text-xs border-b border-border-subtle overflow-hidden text-ellipsis whitespace-nowrap ${selectedCell}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {entry.is_dir ? (
          <span
            className={`inline-block w-4 text-[10px] cursor-pointer select-none align-middle ${isSelected ? "text-white/70 hover:text-white" : "text-text-tertiary hover:text-text-secondary"}`}
            onClick={(ev) => {
              ev.stopPropagation();
              onToggleExpand();
            }}
          >
            {isExpanded ? "\u25BE" : "\u25B8"}
          </span>
        ) : (
          <span className="inline-block w-4 align-middle" />
        )}
        <span className={`mr-1.5 text-xs align-middle ${isSelected ? "opacity-90" : "opacity-60"}`}>{icon(entry)}</span>
        {isRenaming ? (
          <InlineRenameInput
            initialName={entry.name}
            isDir={entry.is_dir}
            onConfirm={onRenameConfirm}
            onCancel={onRenameCancel}
          />
        ) : entry.is_dir ? (
          <span
            className={`cursor-pointer transition-colors align-middle ${isSelected ? "text-white hover:text-white/80" : "text-text-primary hover:text-accent"}`}
            onClick={(ev) => {
              ev.stopPropagation();
              onNavigate();
            }}
          >
            {entry.name}
          </span>
        ) : (
          <span className={`align-middle ${isSelected ? "text-white" : "text-text-secondary"}`}>{entry.name}</span>
        )}
      </td>
      <td className={`px-3 py-[7px] text-xs border-b border-border-subtle ${selectedCell || "text-text-tertiary"}`}>
        {fmtSize(entry.size)}
      </td>
      <td className={`px-3 py-[7px] text-xs border-b border-border-subtle ${selectedCell || "text-text-tertiary"}`}>
        {fmtDate(entry.modified)}
      </td>
    </tr>
  );
};
