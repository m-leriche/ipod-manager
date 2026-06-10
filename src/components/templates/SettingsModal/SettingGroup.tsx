/** Shared header + description wrapper for a group of related settings. */
export const SettingGroup = ({
  title,
  description,
  children,
  first,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  first?: boolean;
}) => (
  <div className={first ? undefined : "mt-6"}>
    <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">{title}</span>
    {description && <p className="text-[10px] text-text-tertiary mb-3">{description}</p>}
    {children}
  </div>
);

/** Checkbox row used across settings sections. */
export const SettingToggle = ({
  label,
  checked,
  onChange,
  testId,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  testId?: string;
  hint?: string;
}) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-accent w-3.5 h-3.5 mt-0.5"
      data-testid={testId}
    />
    <span className="flex flex-col gap-0.5">
      <span className="text-[11px] text-text-primary">{label}</span>
      {hint && <span className="text-[9px] text-text-tertiary leading-snug">{hint}</span>}
    </span>
  </label>
);
