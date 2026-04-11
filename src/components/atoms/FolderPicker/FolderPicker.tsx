interface Props {
  label: string;
  path: string | null;
  onBrowse: () => void;
  disabled?: boolean;
}

export function FolderPicker({ label, path, onBrowse, disabled }: Props) {
  return (
    <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-xl px-3 py-2">
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">{label}</span>
      <span
        className={`flex-1 min-w-0 text-[11px] font-medium truncate text-left ${
          path ? "text-text-secondary" : "text-text-tertiary"
        }`}
      >
        {path || "No folder selected"}
      </span>
      <button
        onClick={onBrowse}
        disabled={disabled}
        className="px-2.5 py-1 bg-bg-card border border-border text-text-tertiary rounded-lg text-[10px] font-medium shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
      >
        Browse
      </button>
    </div>
  );
}
