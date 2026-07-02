import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { SettingGroup } from "./SettingGroup";
import { formatBytes } from "../../../utils/format";
import type { BackupInfo } from "./types";

const formatDate = (epochMs: number): string =>
  new Date(epochMs).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export const BackupSection = () => {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBackups((await invoke<BackupInfo[]>("list_library_backups")) ?? []);
    } catch (e) {
      console.warn("Failed to list backups:", e);
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleBackupNow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("backup_library");
      await refresh();
    } catch (e) {
      setError(`Backup failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleRestore = useCallback(async (backupPath: string) => {
    setBusy(true);
    setError(null);
    try {
      await invoke("restore_library_backup", { backupPath });
      // The restored data is only picked up by a fresh DB connection.
      await relaunch();
    } catch (e) {
      setError(`Restore failed: ${e}`);
      setBusy(false);
      setConfirmingPath(null);
    }
  }, []);

  return (
    <SettingGroup
      title="Backups"
      description="Snapshots of the library database (playlists, ratings, play counts — not audio files). Restoring relaunches the app."
    >
      <div className="flex flex-col gap-2 px-4 py-3 border border-border rounded-xl">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-primary">
            {backups === null ? "Loading…" : `${backups.length} backup${backups.length === 1 ? "" : "s"}`}
          </span>
          <button
            onClick={handleBackupNow}
            disabled={busy}
            className="text-[11px] text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
            data-testid="backup-now"
          >
            Back Up Now
          </button>
        </div>

        {error && (
          <div className="text-[10px] text-red-400" data-testid="backup-error">
            {error}
          </div>
        )}

        {backups && backups.length > 0 && (
          <ul className="flex flex-col gap-1" data-testid="backup-list">
            {backups.map((b) => (
              <li key={b.path} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-text-secondary truncate">
                  {formatDate(b.created_at)}
                  <span className="text-text-tertiary"> · {formatBytes(b.size)}</span>
                </span>
                {confirmingPath === b.path ? (
                  <span className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestore(b.path)}
                      disabled={busy}
                      className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                      data-testid="confirm-restore"
                    >
                      Restore &amp; Relaunch
                    </button>
                    <button
                      onClick={() => setConfirmingPath(null)}
                      disabled={busy}
                      className="text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingPath(b.path)}
                    disabled={busy}
                    className="text-accent hover:text-accent-hover transition-colors shrink-0 disabled:opacity-50"
                    data-testid={`restore-${b.created_at}`}
                  >
                    Restore…
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingGroup>
  );
};
