import { useState, useRef, useEffect, useCallback } from "react";
import { useEqualizer } from "../../../contexts/EqualizerContext";
import { BUILT_IN_PRESETS, PARAMETRIC_PRESETS } from "./constants";

export const PresetDropdown = () => {
  const { state, customPresets, selectPreset, savePreset, deletePreset } = useEqualizer();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [managing, setManaging] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
        setManaging(false);
      }
    };
    const timer = setTimeout(() => window.addEventListener("mousedown", handle), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handle);
    };
  }, [open]);

  // Focus input when saving
  useEffect(() => {
    if (saving) inputRef.current?.focus();
  }, [saving]);

  const handleSelect = useCallback(
    (name: string | null) => {
      selectPreset(name);
      setOpen(false);
      setSaving(false);
      setManaging(false);
    },
    [selectPreset],
  );

  const handleSave = useCallback(() => {
    if (saveName.trim()) {
      savePreset(saveName.trim());
      setSaving(false);
      setSaveName("");
      setOpen(false);
    }
  }, [saveName, savePreset]);

  const handleStartSave = useCallback(() => {
    setSaving(true);
    setManaging(false);
    setSaveName(state.activePreset ?? "");
  }, [state.activePreset]);

  const handleStartManage = useCallback(() => {
    setManaging(true);
    setSaving(false);
  }, []);

  const label = state.activePreset ?? "Manual";

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (open) {
            setSaving(false);
            setManaging(false);
          }
        }}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-border-active transition-colors max-w-[140px]"
      >
        <span className="truncate">{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-[180px] bg-bg-elevated border border-border rounded-lg shadow-xl overflow-hidden z-50 animate-fade-in">
          {/* Save preset input */}
          {saving && (
            <div className="p-2 border-b border-border">
              <input
                ref={inputRef}
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setSaving(false);
                }}
                placeholder="Preset name..."
                className="w-full px-2 py-1 bg-bg-card border border-border rounded text-[10px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-active"
              />
              <div className="flex gap-1 mt-1.5">
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="flex-1 py-1 rounded text-[9px] font-medium bg-accent text-white disabled:opacity-40 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setSaving(false)}
                  className="px-2 py-1 rounded text-[9px] text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Manage presets view */}
          {managing && customPresets.length > 0 && (
            <div className="border-b border-border">
              <div className="px-3 py-1.5 text-[9px] font-medium text-text-tertiary uppercase tracking-widest">
                Custom Presets
              </div>
              {customPresets.map((p) => (
                <div key={p.name} className="flex items-center gap-1 px-3 py-1.5 hover:bg-bg-hover transition-colors">
                  <span className="flex-1 text-[11px] text-text-secondary truncate">{p.name}</span>
                  <button
                    onClick={() => deletePreset(p.name)}
                    className="shrink-0 p-0.5 text-text-tertiary hover:text-danger transition-colors"
                    title="Delete preset"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={() => setManaging(false)}
                className="w-full px-3 py-1.5 text-[10px] text-text-tertiary hover:text-text-secondary text-left transition-colors border-t border-border"
              >
                Done
              </button>
            </div>
          )}

          {/* Menu items */}
          {!saving && !managing && (
            <div className="max-h-[320px] overflow-y-auto">
              {/* Manual */}
              <PresetItem name="Manual" active={state.activePreset === null} onClick={() => handleSelect(null)} />

              <div className="border-t border-border" />

              {/* Actions */}
              <button
                onClick={handleStartSave}
                className="w-full px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-hover text-left transition-colors"
              >
                Save As Preset...
              </button>
              {customPresets.length > 0 && (
                <button
                  onClick={handleStartManage}
                  className="w-full px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-hover text-left transition-colors"
                >
                  Manage Presets...
                </button>
              )}

              <div className="border-t border-border" />

              {/* Built-in presets */}
              {BUILT_IN_PRESETS.map((p) => (
                <PresetItem
                  key={p.name}
                  name={p.name}
                  active={state.activePreset === p.name}
                  onClick={() => handleSelect(p.name)}
                />
              ))}

              {/* Headphone profiles (parametric) */}
              {PARAMETRIC_PRESETS.length > 0 && (
                <>
                  <div className="border-t border-border" />
                  <div className="px-3 py-1 text-[9px] font-medium text-text-tertiary uppercase tracking-widest">
                    Headphone Profiles
                  </div>
                  {PARAMETRIC_PRESETS.map((p) => (
                    <PresetItem
                      key={p.name}
                      name={p.name}
                      subtitle={p.source}
                      active={state.activePreset === p.name}
                      onClick={() => handleSelect(p.name)}
                    />
                  ))}
                </>
              )}

              {/* Custom presets */}
              {customPresets.length > 0 && (
                <>
                  <div className="border-t border-border" />
                  <div className="px-3 py-1 text-[9px] font-medium text-text-tertiary uppercase tracking-widest">
                    Custom
                  </div>
                  {customPresets.map((p) => (
                    <PresetItem
                      key={p.name}
                      name={p.name}
                      active={state.activePreset === p.name}
                      onClick={() => handleSelect(p.name)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PresetItem = ({
  name,
  subtitle,
  active,
  onClick,
}: {
  name: string;
  subtitle?: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full px-3 py-1.5 text-[11px] text-left transition-colors flex items-center gap-2 ${
      active ? "text-accent bg-accent/10" : "text-text-primary hover:bg-bg-hover"
    }`}
  >
    <span className="w-3 shrink-0 text-center">{active ? "\u2713" : ""}</span>
    <span className="truncate flex-1">{name}</span>
    {subtitle && <span className="text-[9px] text-text-tertiary shrink-0">{subtitle}</span>}
  </button>
);
