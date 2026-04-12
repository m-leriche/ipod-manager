import type { FolderPickerProps } from "./types";

export const FolderPicker = ({
  label,
  path,
  onBrowse,
  disabled,
  placeholder = "No folder selected",
}: FolderPickerProps) => (
  <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-xl px-4 py-2.5">
    <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">{label}</span>
    <span
      className={`flex-1 min-w-0 text-xs font-medium truncate text-left ${
        path ? "text-text-secondary" : "text-text-tertiary"
      }`}
    >
      {path || placeholder}
    </span>
    <button
      onClick={onBrowse}
      disabled={disabled}
      className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
    >
      Browse
    </button>
  </div>
);
