import { useState, useEffect, useCallback } from "react";
import {
  SHORTCUT_DEFS,
  DEFAULT_BINDINGS,
  getBinding,
  setBindingOverride,
  resetAllBindings,
  eventToBinding,
  formatBinding,
  findConflict,
  bindingsEqual,
} from "../../../utils/shortcuts";
import type { ShortcutAction } from "../../../types/shortcuts";
import { SettingGroup } from "./SettingGroup";

export const ShortcutsSection = () => {
  // Bindings are read from settings; bump to re-render after changes
  const [, setVersion] = useState(0);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [conflict, setConflict] = useState<{ action: ShortcutAction; with: string } | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // Capture the next keydown while recording
  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setRecording(null);
        return;
      }
      const binding = eventToBinding(e);
      if (!binding) return; // bare modifier — keep recording

      const conflictingLabel = findConflict(binding, recording);
      if (conflictingLabel) {
        setConflict({ action: recording, with: conflictingLabel });
        setRecording(null);
        return;
      }

      const isDefault = bindingsEqual(binding, DEFAULT_BINDINGS[recording]);
      setBindingOverride(recording, isDefault ? null : binding);
      setConflict(null);
      setRecording(null);
      refresh();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [recording, refresh]);

  const handleReset = useCallback(
    (action: ShortcutAction) => {
      setBindingOverride(action, null);
      setConflict(null);
      refresh();
    },
    [refresh],
  );

  const handleResetAll = useCallback(() => {
    resetAllBindings();
    setConflict(null);
    setRecording(null);
    refresh();
  }, [refresh]);

  const categories = ["Playback", "Library", "General"] as const;

  return (
    <SettingGroup
      title="Keyboard Shortcuts"
      description="Click a shortcut to record a new key combination. Press Escape to cancel recording."
      first
    >
      {conflict && (
        <div className="px-3 py-2.5 mb-3 rounded-xl text-[10px] bg-warning/10 text-warning" role="alert">
          That combination is already used by “{conflict.with}”. Choose a different one.
        </div>
      )}

      {categories.map((category) => {
        const defs = SHORTCUT_DEFS.filter((d) => d.category === category);
        if (defs.length === 0) return null;
        return (
          <div key={category} className="mb-4">
            <span className="text-[10px] font-medium text-text-tertiary block mb-2">{category}</span>
            <div className="flex flex-col border border-border rounded-xl overflow-hidden divide-y divide-border">
              {defs.map((def) => {
                const binding = getBinding(def.action);
                const isRecording = recording === def.action;
                const isCustomized = !bindingsEqual(binding, DEFAULT_BINDINGS[def.action]);
                return (
                  <div key={def.action} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[11px] text-text-primary flex-1 min-w-0 truncate">{def.label}</span>
                    {isCustomized && !isRecording && (
                      <button
                        onClick={() => handleReset(def.action)}
                        className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
                        data-testid={`reset-shortcut-${def.action}`}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      onClick={() => setRecording(isRecording ? null : def.action)}
                      aria-label={`Change shortcut for ${def.label}`}
                      className={`flex items-center gap-1 min-w-[72px] justify-end ${
                        isRecording ? "opacity-100" : "hover:opacity-80"
                      }`}
                      data-testid={`shortcut-${def.action}`}
                    >
                      {isRecording ? (
                        <span className="text-[10px] text-accent animate-pulse">Press keys…</span>
                      ) : (
                        formatBinding(binding).map((key, i) => (
                          <kbd
                            key={i}
                            className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 bg-bg-card border rounded-md text-[10px] font-medium ${
                              isCustomized ? "border-accent/50 text-accent" : "border-border text-text-primary"
                            }`}
                          >
                            {key}
                          </kbd>
                        ))
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button
        onClick={handleResetAll}
        className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
        data-testid="reset-all-shortcuts"
      >
        Reset all to defaults
      </button>

      <p className="text-[9px] text-text-tertiary leading-snug mt-3">
        List navigation (arrows, Enter, Escape) and click-modifier shortcuts are fixed.
      </p>
    </SettingGroup>
  );
};
