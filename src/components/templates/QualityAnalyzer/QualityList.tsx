import type { VerdictGroup } from "./types";
import { formatBitrate, formatSampleRate, verdictColor, verdictBgColor } from "./helpers";

interface QualityListProps {
  groups: VerdictGroup[];
  selectedFile: string | null;
  onSelectFile: (filePath: string) => void;
}

export const QualityList = ({ groups, selectedFile, onSelectFile }: QualityListProps) => (
  <div className="flex-1 overflow-y-auto bg-bg-secondary border border-border rounded-2xl min-h-0">
    {groups.length === 0 ? (
      <div className="py-12 text-center text-text-tertiary text-xs">No audio files found</div>
    ) : (
      <div>
        {groups.map((group) => (
          <div key={group.verdict}>
            {/* Group header */}
            <div className="px-4 py-2.5 bg-bg-card border-b border-border sticky top-0 z-10 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${verdictBgColor(group.verdict)}`} />
              <span className={`text-[11px] font-medium uppercase tracking-widest ${verdictColor(group.verdict)}`}>
                {group.label}
              </span>
              <span className="text-[11px] text-text-tertiary">({group.files.length})</span>
            </div>

            {/* File rows */}
            {group.files.map((file) => (
              <div
                key={file.file_path}
                onClick={() => onSelectFile(file.file_path)}
                className={`flex items-center gap-3 px-4 py-2 border-b border-border-subtle cursor-pointer transition-colors hover:bg-bg-hover/50 ${
                  selectedFile === file.file_path ? "bg-bg-hover/30" : ""
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${verdictBgColor(file.verdict)}`} />
                <span className="text-[11px] text-text-secondary truncate flex-1 min-w-0">{file.file_name}</span>
                <span className="text-[10px] text-text-tertiary bg-bg-card px-1.5 py-0.5 rounded font-medium shrink-0 uppercase">
                  {file.codec}
                </span>
                <span className="text-[10px] text-text-tertiary w-14 text-right shrink-0 tabular-nums">
                  {formatSampleRate(file.sample_rate)}
                </span>
                {file.bitrate && (
                  <span className="text-[10px] text-text-tertiary w-10 text-right shrink-0 tabular-nums">
                    {formatBitrate(file.bitrate)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    )}
  </div>
);
