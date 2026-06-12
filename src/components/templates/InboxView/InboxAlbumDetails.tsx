import { useState } from "react";
import { formatDuration } from "../AudioConverter/helpers";
import { CONVERT_TARGETS } from "./constants";
import { formatTrackQuality } from "./helpers";
import type { ConvertTarget, InboxAlbum } from "./types";

export const InboxAlbumDetails = ({
  album,
  disabled,
  onConvert,
}: {
  album: InboxAlbum;
  disabled: boolean;
  onConvert: (album: InboxAlbum, target: ConvertTarget) => void;
}) => {
  const [targetIndex, setTargetIndex] = useState(0);

  return (
    <div className="mt-3 pt-3 border-t border-border-subtle flex flex-col gap-1.5">
      {album.tracks.map((t) => (
        <div key={t.file_path} className="flex items-center gap-3 text-[11px]">
          <span className="w-5 text-right text-text-tertiary shrink-0">{t.track_number ?? "–"}</span>
          <span className="flex-1 min-w-0 truncate text-text-secondary">{t.title ?? t.file_name}</span>
          <span className="text-text-tertiary shrink-0">{formatTrackQuality(t)}</span>
          <span className="w-10 text-right text-text-tertiary shrink-0">{formatDuration(t.duration_secs)}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-2">
        <select
          value={targetIndex}
          onChange={(e) => setTargetIndex(Number(e.target.value))}
          disabled={disabled}
          data-testid="convert-target"
          className="bg-bg-card border border-border rounded-md px-2 py-1 text-[11px] text-text-primary"
        >
          {CONVERT_TARGETS.map((t, i) => (
            <option key={t.label} value={i}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => onConvert(album, CONVERT_TARGETS[targetIndex])}
          disabled={disabled}
          className="px-3 py-1 rounded-md text-[11px] font-medium text-text-secondary border border-border hover:text-text-primary hover:border-border-active transition-colors disabled:opacity-50"
        >
          Convert
        </button>
        <span className="text-[10px] text-text-tertiary">Replaces the original files</span>
      </div>
    </div>
  );
};
