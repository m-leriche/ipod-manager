import { useState, useEffect } from "react";
import { RetroWindowDots } from "../../atoms/RetroWindowDots/RetroWindowDots";
import { GeneralSection } from "./GeneralSection";
import { AppearanceSection } from "./AppearanceSection";
import { PlaybackSection } from "./PlaybackSection";
import { LibrarySection } from "./LibrarySection";
import { ShortcutsSection } from "./ShortcutsSection";
import { ConnectionsSection } from "./ConnectionsSection";
import type { SettingsModalProps, SettingsSection, SettingsSectionDef } from "./types";

const SECTIONS: SettingsSectionDef[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "playback", label: "Playback" },
  { id: "library", label: "Library" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "connections", label: "Connections" },
];

export const SettingsModal = ({ onClose, onLibraryChanged, onReplayTour, autoCheckUpdate }: SettingsModalProps) => {
  const [section, setSection] = useState<SettingsSection>("general");
  // One-shot: sections remount on nav, so the auto-check must be consumed at modal level
  const [autoCheckPending, setAutoCheckPending] = useState(autoCheckUpdate ?? false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="settings-backdrop" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[720px] max-w-[95vw] h-[80vh] max-h-[640px] flex flex-col"
      >
        {/* Header */}
        <div className="retro-titlebar flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <RetroWindowDots />
            <h2 id="settings-dialog-title" className="text-sm font-medium text-text-primary">
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 min-h-0 flex">
          <nav
            className="w-[150px] shrink-0 border-r border-border p-3 flex flex-col gap-1"
            role="tablist"
            aria-label="Settings sections"
            aria-orientation="vertical"
          >
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={section === s.id}
                onClick={() => setSection(s.id)}
                className={`text-left px-3 py-2 rounded-lg text-[11px] font-medium transition-all ${
                  section === s.id
                    ? "bg-bg-card text-text-primary border border-border-active"
                    : "text-text-tertiary border border-transparent hover:text-text-secondary hover:bg-bg-hover/50"
                }`}
                data-testid={`settings-nav-${s.id}`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {section === "general" && (
              <GeneralSection
                onLibraryChanged={onLibraryChanged}
                onReplayTour={onReplayTour}
                autoCheckUpdate={autoCheckPending}
                onAutoCheckStarted={() => setAutoCheckPending(false)}
              />
            )}
            {section === "appearance" && <AppearanceSection />}
            {section === "playback" && <PlaybackSection />}
            {section === "library" && <LibrarySection />}
            {section === "shortcuts" && <ShortcutsSection />}
            {section === "connections" && <ConnectionsSection />}
          </div>
        </div>
      </div>
    </div>
  );
};
