import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ExportResult, ImportResult, ExportPhase, ImportPhase } from "./types";
import { defaultExportFilename } from "./helpers";
import { formatBytes } from "../../../utils/format";

export const LibraryExport = () => {
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExportError(null);

    const dir = await open({ directory: true, title: "Choose export destination" });
    if (!dir) return;

    const outputPath = `${dir}/${defaultExportFilename()}`;

    setExportPhase("exporting");
    try {
      const data = await invoke<ExportResult>("export_library", { outputPath });
      setExportResult(data);
      setExportPhase("done");
    } catch (e) {
      setExportError(`${e}`);
      setExportPhase("idle");
    }
  };

  const handleImport = async () => {
    setImportError(null);

    const file = await open({
      title: "Select backup file",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!file) return;

    setImportPhase("importing");
    try {
      const data = await invoke<ImportResult>("import_library", { inputPath: file });
      setImportResult(data);
      setImportPhase("done");
    } catch (e) {
      setImportError(`${e}`);
      setImportPhase("idle");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Export / Import</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg space-y-6">
          {/* Export section */}
          <section>
            <h3 className="text-xs font-medium text-text-primary mb-1">Export Backup</h3>
            <p className="text-text-secondary text-xs mb-4">
              Export your tracks, playlists, ratings, play counts, and smart playlists to a JSON backup file. This
              preserves your library metadata so you can restore it if you rebuild your library.
            </p>

            {exportError && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-danger text-xs">{exportError}</p>
              </div>
            )}

            {exportPhase === "done" && exportResult && (
              <div className="bg-bg-card border border-border rounded-xl px-4 py-3 mb-4">
                <p className="text-success text-xs font-medium mb-3">Export complete</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="text-text-tertiary">Tracks</div>
                  <div className="text-text-primary">{exportResult.track_count.toLocaleString()} tracks</div>
                  <div className="text-text-tertiary">Playlists</div>
                  <div className="text-text-primary">{exportResult.playlist_count} playlists</div>
                  <div className="text-text-tertiary">Smart playlists</div>
                  <div className="text-text-primary">{exportResult.smart_playlist_count} smart playlists</div>
                  <div className="text-text-tertiary">File size</div>
                  <div className="text-text-primary">{formatBytes(exportResult.file_size)}</div>
                  <div className="text-text-tertiary">Saved to</div>
                  <div className="text-text-primary truncate" title={exportResult.path}>
                    {exportResult.path}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exportPhase === "exporting"}
              className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover transition-all disabled:opacity-30"
            >
              {exportPhase === "exporting"
                ? "Exporting..."
                : exportPhase === "done"
                  ? "Export Again"
                  : "Export Library"}
            </button>
          </section>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Import section */}
          <section>
            <h3 className="text-xs font-medium text-text-primary mb-1">Import from Backup</h3>
            <p className="text-text-secondary text-xs mb-4">
              Restore ratings, play counts, playlists, and smart playlists from a previously exported backup file.
              Tracks must already exist in your library — this restores metadata, not audio files.
            </p>

            {importError && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-danger text-xs">{importError}</p>
              </div>
            )}

            {importPhase === "done" && importResult && (
              <div className="bg-bg-card border border-border rounded-xl px-4 py-3 mb-4">
                <p className="text-success text-xs font-medium mb-3">Import complete</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="text-text-tertiary">Tracks updated</div>
                  <div className="text-text-primary">{importResult.tracks_updated.toLocaleString()}</div>
                  <div className="text-text-tertiary">Tracks skipped</div>
                  <div className="text-text-primary">{importResult.tracks_skipped.toLocaleString()}</div>
                  <div className="text-text-tertiary">Playlists imported</div>
                  <div className="text-text-primary">{importResult.playlists_imported}</div>
                  <div className="text-text-tertiary">Playlists skipped</div>
                  <div className="text-text-primary">{importResult.playlists_skipped}</div>
                  <div className="text-text-tertiary">Smart playlists imported</div>
                  <div className="text-text-primary">{importResult.smart_playlists_imported}</div>
                  <div className="text-text-tertiary">Smart playlists skipped</div>
                  <div className="text-text-primary">{importResult.smart_playlists_skipped}</div>
                </div>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importPhase === "importing"}
              className="px-4 py-2 bg-bg-card border border-border text-text-secondary rounded-lg text-xs font-medium hover:text-text-primary hover:border-border-active transition-all disabled:opacity-30"
            >
              {importPhase === "importing"
                ? "Importing..."
                : importPhase === "done"
                  ? "Import Again"
                  : "Import from Backup"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
