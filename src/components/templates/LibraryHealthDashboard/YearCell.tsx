interface YearCellProps {
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (draft: string) => void;
}

export const YearCell = ({ value, label, disabled, onChange }: YearCellProps) => (
  <input
    type="text"
    inputMode="numeric"
    maxLength={4}
    value={value}
    disabled={disabled}
    placeholder="Add"
    aria-label={label}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === "Escape") onChange("");
    }}
    className={`w-14 bg-transparent border rounded px-1.5 py-0.5 text-xs text-text-primary placeholder:text-text-tertiary/40 outline-none transition-colors disabled:opacity-50 ${
      value ? "border-accent/50" : "border-transparent hover:border-border focus:border-border-active"
    }`}
  />
);
