import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ExportResult, Phase } from "./types";
import { formatBytes, defaultExportFilename } from "./helpers";

export const LibraryExport = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);

    const dir = await open({ directory: true, title: "Choose export destination" });
    if (!dir) return;

    const outputPath = `${dir}/${defaultExportFilename()}`;

    setPhase("exporting");
    try {
      const data = await invoke<ExportResult>("export_library", { outputPath });
      setResult(data);
      setPhase("done");
    } catch (e) {
      setError(`${e}`);
      setPhase("idle");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Export / Backup</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg">
          <p className="text-text-secondary text-xs mb-4">
            Export your tracks, playlists, ratings, play counts, and smart playlists to a JSON backup file. This
            preserves your library metadata so you can restore it if you rebuild your library.
          </p>

          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-danger text-xs">{error}</p>
            </div>
          )}

          {phase === "done" && result && (
            <div className="bg-bg-card border border-border rounded-xl px-4 py-3 mb-4">
              <p className="text-success text-xs font-medium mb-3">Export complete</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="text-text-tertiary">Tracks</div>
                <div className="text-text-primary">{result.track_count.toLocaleString()} tracks</div>
                <div className="text-text-tertiary">Playlists</div>
                <div className="text-text-primary">{result.playlist_count} playlists</div>
                <div className="text-text-tertiary">Smart playlists</div>
                <div className="text-text-primary">{result.smart_playlist_count} smart playlists</div>
                <div className="text-text-tertiary">File size</div>
                <div className="text-text-primary">{formatBytes(result.file_size)}</div>
                <div className="text-text-tertiary">Saved to</div>
                <div className="text-text-primary truncate" title={result.path}>
                  {result.path}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={phase === "exporting"}
            className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover transition-all disabled:opacity-30"
          >
            {phase === "exporting" ? "Exporting..." : phase === "done" ? "Export Again" : "Export Library"}
          </button>
        </div>
      </div>
    </div>
  );
};
