import { useState } from "react";
import type { ProfileSelectorProps } from "./types";

type InlineMode = null | "creating" | "renaming" | "duplicating" | "confirmingDelete";

export const ProfileSelector = ({
  profiles,
  activeProfile,
  onSwitch,
  onCreate,
  onDelete,
  onRename,
  onDuplicate,
  onToggleFilters,
  filterCount,
  isDirty,
  onSave,
  onDiscard,
}: ProfileSelectorProps) => {
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);
  const [inputName, setInputName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetInline = () => {
    setInlineMode(null);
    setInputName("");
    setError(null);
  };

  const validateName = (name: string): string | null => {
    if (!name) return null;
    if (profiles.some((p) => p.name === name)) return "A profile with this name already exists";
    return null;
  };

  const handleSubmit = () => {
    const trimmed = inputName.trim();
    if (!trimmed) return;
    const err = validateName(trimmed);
    if (err) {
      setError(err);
      return;
    }
    if (inlineMode === "creating") onCreate(trimmed);
    if (inlineMode === "renaming" && activeProfile) onRename?.(activeProfile.name, trimmed);
    if (inlineMode === "duplicating" && activeProfile) onDuplicate?.(activeProfile.name, trimmed);
    resetInline();
  };

  const openInline = (mode: InlineMode, defaultName = "") => {
    setInlineMode(mode);
    setInputName(defaultName);
    setError(null);
  };

  const btnClass =
    "w-6 h-6 bg-bg-card border border-border rounded-lg text-text-tertiary text-xs flex items-center justify-center hover:text-text-secondary hover:border-border-active transition-all";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">Profile</span>

        <select
          value={activeProfile?.name ?? ""}
          onChange={(e) => onSwitch(e.target.value)}
          className="px-2 py-1 bg-bg-card border border-border rounded-lg text-[11px] text-text-secondary outline-none focus:border-border-active transition-colors min-w-[120px]"
        >
          <option value="">None</option>
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        <button onClick={() => openInline("creating")} className={btnClass} title="Create profile">
          +
        </button>

        {activeProfile && (
          <>
            {onRename && (
              <button
                onClick={() => openInline("renaming", activeProfile.name)}
                className={btnClass}
                title="Rename profile"
              >
                &#9998;
              </button>
            )}
            {onDuplicate && (
              <button
                onClick={() => openInline("duplicating", `${activeProfile.name} (copy)`)}
                className={btnClass}
                title="Duplicate profile"
              >
                &#8599;
              </button>
            )}
            <button
              onClick={() => openInline("confirmingDelete")}
              className="w-6 h-6 bg-bg-card border border-border rounded-lg text-text-tertiary text-xs flex items-center justify-center hover:text-danger hover:border-danger/30 transition-all"
              title="Delete profile"
            >
              &times;
            </button>

            {onToggleFilters && (
              <button
                onClick={onToggleFilters}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                  (filterCount ?? 0) > 0
                    ? "bg-accent/10 border-accent/30 text-accent"
                    : "bg-transparent border-border text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Filters{(filterCount ?? 0) > 0 ? ` (${filterCount})` : ""}
              </button>
            )}

            {isDirty && (
              <>
                <button
                  onClick={onSave}
                  className="px-2.5 py-1 bg-success/10 border border-success/30 text-success rounded-lg text-[10px] font-medium hover:bg-success/20 transition-all"
                >
                  Save profile
                </button>
                <button
                  onClick={onDiscard}
                  className="px-2.5 py-1 bg-bg-card border border-border text-text-tertiary rounded-lg text-[10px] font-medium hover:text-text-secondary transition-all"
                >
                  Discard
                </button>
              </>
            )}
          </>
        )}
      </div>

      {(inlineMode === "creating" || inlineMode === "renaming" || inlineMode === "duplicating") && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputName}
            onChange={(e) => {
              setInputName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") resetInline();
            }}
            placeholder="Profile name"
            autoFocus
            className="flex-1 px-2.5 py-1.5 bg-bg-card border border-border rounded-lg text-[11px] text-text-primary outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
          />
          <button
            onClick={handleSubmit}
            disabled={!inputName.trim()}
            className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[10px] font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {inlineMode === "creating" ? "Save" : inlineMode === "renaming" ? "Rename" : "Duplicate"}
          </button>
          <button
            onClick={resetInline}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[10px] font-medium hover:text-text-secondary transition-all"
          >
            Cancel
          </button>
          {error && <span className="text-[10px] text-danger">{error}</span>}
        </div>
      )}

      {inlineMode === "confirmingDelete" && activeProfile && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-secondary">
            Are you sure you want to delete this profile? This is permanent and cannot be undone.
          </span>
          <button
            onClick={() => {
              onDelete(activeProfile.name);
              resetInline();
            }}
            className="px-3 py-1.5 bg-danger/10 border border-danger/30 text-danger rounded-lg text-[10px] font-medium hover:bg-danger/20 transition-all shrink-0"
          >
            Delete
          </button>
          <button
            onClick={resetInline}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[10px] font-medium hover:text-text-secondary transition-all shrink-0"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};
