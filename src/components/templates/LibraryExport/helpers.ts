export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  if (i >= 3) return `${val.toFixed(2)} ${units[i]}`;
  if (i >= 1) return `${val.toFixed(1)} ${units[i]}`;
  return `${bytes} B`;
};

export const defaultExportFilename = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `crate-library-backup-${y}-${m}-${d}.json`;
};
