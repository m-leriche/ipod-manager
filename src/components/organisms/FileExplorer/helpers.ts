import type { FileEntry, ClipboardState } from "./types";
import type { ContextMenuItem } from "../../molecules/ContextMenu/types";

const AUDIO_EXT = new Set(["mp3", "flac", "aac", "m4a", "ogg", "opus", "wav", "wma", "aiff", "alac"]);

export const fmtSize = (b: number): string => {
  if (b === 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};

export const fmtDate = (s: number): string => {
  if (s === 0) return "";
  const d = new Date(s * 1000);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
};

export const icon = (e: FileEntry): string => {
  if (e.is_dir) return "\ud83d\udcc1";
  const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXT.has(ext) ? "\ud83c\udfb5" : "\ud83d\udcc4";
};

export const joinPath = (dir: string, name: string): string => (dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`);

export const deduplicateName = (name: string, existingNames: Set<string>): string => {
  if (!existingNames.has(name)) return name;

  const dotIndex = name.lastIndexOf(".");
  const hasExt = dotIndex > 0;
  const base = hasExt ? name.slice(0, dotIndex) : name;
  const ext = hasExt ? name.slice(dotIndex) : "";

  let candidate = `${base} (copy)${ext}`;
  if (!existingNames.has(candidate)) return candidate;

  let n = 2;
  while (existingNames.has(`${base} (copy ${n})${ext}`)) n++;
  return `${base} (copy ${n})${ext}`;
};

export const buildContextMenuItems = ({
  target,
  selectedCount,
  clipboard,
  allowDelete,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onNewFolder,
  onDelete,
}: {
  target: "entry" | "empty";
  selectedCount: number;
  clipboard: ClipboardState | null;
  allowDelete: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
}): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [];

  if (target === "entry") {
    const label = selectedCount > 1 ? `Copy ${selectedCount} Items` : "Copy";
    items.push({ label, onClick: onCopy, shortcut: "\u2318C" });
    if (allowDelete) {
      const cutLabel = selectedCount > 1 ? `Cut ${selectedCount} Items` : "Cut";
      items.push({ label: cutLabel, onClick: onCut, shortcut: "\u2318X" });
    }
    items.push({ type: "separator" });
    if (clipboard) {
      items.push({ label: "Paste", onClick: onPaste, shortcut: "\u2318V" });
      items.push({ type: "separator" });
    }
    if (selectedCount === 1) {
      items.push({ label: "Rename", onClick: onRename, shortcut: "F2" });
      items.push({ type: "separator" });
    }
    if (allowDelete) {
      const delLabel = selectedCount > 1 ? `Delete ${selectedCount} Items` : "Delete";
      items.push({ label: delLabel, onClick: onDelete, shortcut: "\u232b" });
    }
  } else {
    if (clipboard) {
      items.push({ label: "Paste", onClick: onPaste, shortcut: "\u2318V" });
      items.push({ type: "separator" });
    }
    items.push({ label: "New Folder", onClick: onNewFolder, shortcut: "\u2318\u21e7N" });
  }

  return items;
};
