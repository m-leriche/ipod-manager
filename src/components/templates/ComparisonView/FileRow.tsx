import { memo } from "react";
import { STATUS_ICON, STATUS_BADGE, FILE_ROW_BG } from "./constants";
import { fmtSize, lastSegment, mp3Name } from "./helpers";
import type { FileRowProps } from "./types";

const FileRowImpl = ({ entry, depth, isSelected, onToggleFile }: FileRowProps) => (
  <div
    className={`flex items-center gap-2.5 py-[6px] pr-4 transition-colors ${FILE_ROW_BG[entry.status]}`}
    style={{ paddingLeft: `${40 + depth * 24}px` }}
  >
    {/* Checkbox */}
    <div className="w-3 shrink-0 flex justify-center">
      {entry.status !== "same" ? (
        <input
          type="checkbox"
          checked={isSelected}
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

    {/* Transcode marker */}
    {entry.transcoded && (
      <span
        className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[9px] font-bold shrink-0"
        title={`Synced as ${mp3Name(lastSegment(entry.relative_path))}`}
      >
        MP3
      </span>
    )}

    {/* Sizes */}
    <span className="text-[10px] text-text-tertiary w-16 text-right shrink-0">{fmtSize(entry.source_size)}</span>
    <span className="text-[10px] text-text-tertiary w-16 text-right shrink-0">{fmtSize(entry.target_size)}</span>
  </div>
);

export const FileRow = memo(FileRowImpl);
