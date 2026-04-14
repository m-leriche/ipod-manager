import { useState, useMemo, useEffect } from "react";
import type { FileDetail } from "../../../types/libstats";
import type { StatsFilter, DetailSortKey, DetailSortDir } from "./types";
import { filterFileDetails, sortFileDetails, formatBytes, formatNumber } from "./helpers";

interface StatsDetailModalProps {
  filter: StatsFilter;
  files: FileDetail[];
  onClose: () => void;
}

const COLUMNS: { key: DetailSortKey; label: string; align?: "right" }[] = [
  { key: "path", label: "Path" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "title", label: "Title" },
  { key: "size", label: "Size", align: "right" },
];

export const StatsDetailModal = ({ filter, files, onClose }: StatsDetailModalProps) => {
  const [sortKey, setSortKey] = useState<DetailSortKey>("path");
  const [sortDir, setSortDir] = useState<DetailSortDir>("asc");

  const filtered = useMemo(() => filterFileDetails(files, filter), [files, filter]);
  const sorted = useMemo(() => sortFileDetails(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSort = (key: DetailSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const arrow = (key: DetailSortKey) => {
    if (key !== sortKey) return null;
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="modal-backdrop" />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[800px] max-w-[95vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-medium text-text-primary">{filter.displayLabel}</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-secondary z-10">
              <tr className="text-left text-[10px] text-text-tertiary uppercase tracking-wider">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-4 py-2.5 font-medium cursor-pointer hover:text-text-secondary transition-colors select-none ${col.align === "right" ? "text-right" : ""}`}
                  >
                    {col.label}
                    {arrow(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((file, i) => (
                <tr
                  key={`${file.relative_path}-${i}`}
                  className="border-t border-border-subtle hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-2 text-text-primary truncate max-w-[250px]" title={file.relative_path}>
                    {file.relative_path}
                  </td>
                  <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{file.artist || "—"}</td>
                  <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{file.album || "—"}</td>
                  <td className="px-4 py-2 text-text-secondary truncate max-w-[140px]">{file.title || "—"}</td>
                  <td className="px-4 py-2 text-right text-text-tertiary tabular-nums shrink-0">
                    {formatBytes(file.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <span className="text-[11px] text-text-tertiary">{formatNumber(sorted.length)} tracks</span>
        </div>
      </div>
    </div>
  );
};
