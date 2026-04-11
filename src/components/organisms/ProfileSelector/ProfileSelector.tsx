import { useState } from "react";
import type { ProfileSelectorProps } from "./types";

export const ProfileSelector = ({
  profiles,
  activeProfile,
  onSwitch,
  onCreate,
  onDelete,
  onToggleFilters,
  filterCount,
  isDirty,
  onSave,
  onDiscard,
}: ProfileSelectorProps) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (profiles.some((p) => p.name === trimmed)) {
      setError("A profile with this name already exists");
      return;
    }
    onCreate(trimmed);
    setNewName("");
    setCreating(false);
    setError(null);
  };

  const handleCancel = () => {
    setCreating(false);
    setNewName("");
    setError(null);
  };

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

        <button
          onClick={() => setCreating(true)}
          className="w-6 h-6 bg-bg-card border border-border rounded-lg text-text-tertiary text-xs flex items-center justify-center hover:text-text-secondary hover:border-border-active transition-all"
          title="Create profile"
        >
          +
        </button>

        {activeProfile && (
          <>
            <button
              onClick={() => onDelete(activeProfile.name)}
              className="w-6 h-6 bg-bg-card border border-border rounded-lg text-text-tertiary text-xs flex items-center justify-center hover:text-danger hover:border-danger/30 transition-all"
              title="Delete profile"
            >
              &times;
            </button>

            <button
              onClick={onToggleFilters}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                filterCount > 0
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "bg-transparent border-border text-text-tertiary hover:text-text-secondary"
              }`}
            >
              Filters{filterCount > 0 ? ` (${filterCount})` : ""}
            </button>

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

      {creating && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            placeholder="Profile name"
            autoFocus
            className="flex-1 px-2.5 py-1.5 bg-bg-card border border-border rounded-lg text-[11px] text-text-primary outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
          />
          <button
            onClick={handleSave}
            disabled={!newName.trim()}
            className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[10px] font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[10px] font-medium hover:text-text-secondary transition-all"
          >
            Cancel
          </button>
          {error && <span className="text-[10px] text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
};
