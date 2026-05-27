import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProgress } from "../../../contexts/ProgressContext";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { cancelSync } from "../../../utils/cancelSync";
import { pickFolder } from "../../../utils/pickPath";
import { useTheme } from "../../../contexts/ThemeContext";
import type { BuiltinThemeName } from "../../../contexts/ThemeContext";
import type { ReplayGainMode } from "../../../contexts/playback/types";
import type { CustomTheme } from "../../../types/customTheme";
import { RetroWindowDots } from "../../atoms/RetroWindowDots/RetroWindowDots";
import type { LibraryScanProgress } from "../../../types/library";
import { LastfmSettings } from "./LastfmSettings";
import { StreamingSettings } from "./StreamingSettings";
import { UpdateSection } from "./UpdateSection";
import { CustomThemeEditor } from "./CustomThemeEditor";
import type { SettingsModalProps } from "./types";

const DiscoverSettings = () => {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_discover_enabled")
      .then((v) => {
        setEnabled(v);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggle = useCallback(async (value: boolean) => {
    setEnabled(value);
    try {
      await invoke("set_discover_enabled", { enabled: value });
    } catch {
      setEnabled(!value);
    }
  }, []);

  if (!loaded) return null;

  return (
    <div className="mt-6">
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">Discover</span>
      <p className="text-[10px] text-text-tertiary mb-3">
        Get artist and album recommendations from Last.fm based on your library.
      </p>
      <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="accent-accent w-3.5 h-3.5"
            data-testid="discover-toggle"
          />
          <span className="text-[11px] text-text-primary">Enable Discover tab</span>
        </label>
      </div>
    </div>
  );
};

const THEMES: { id: BuiltinThemeName; label: string; description: string; preview: [string, string, string] }[] = [
  { id: "dark", label: "Dark", description: "Minimal dark theme", preview: ["#000000", "#111111", "#0066FF"] },
  { id: "light", label: "Light", description: "Clean light theme", preview: ["#F4F4F6", "#EDEDEF", "#0066FF"] },
  {
    id: "win95",
    label: "Windows 95",
    description: "Classic Win95 desktop",
    preview: ["#C0C0C0", "#000080", "#FFFFFF"],
  },
  { id: "classic", label: "Classic", description: "Vintage Mac + iPod", preview: ["#F2F0ED", "#D9D7D4", "#000000"] },
  { id: "winamp", label: "Winamp", description: "Classic media player", preview: ["#232323", "#2A2A2A", "#00FF00"] },
  { id: "aqua", label: "Aqua", description: "Mac OS X era", preview: ["#E8E8E8", "#C8C8C8", "#3498DB"] },
  { id: "spotify", label: "Spotify", description: "Music streaming", preview: ["#121212", "#1DB954", "#FFFFFF"] },
];

export const SettingsModal = ({ onClose, onLibraryChanged }: SettingsModalProps) => {
  const [libraryLocation, setLibraryLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const { theme, setTheme, customThemes, deleteCustomTheme } = useTheme();
  const { state: playbackState, setCrossfade, setReplayGain } = usePlayback();
  const [editorState, setEditorState] = useState<CustomTheme | "new" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("get_library_location")
      .then(setLibraryLocation)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSetLibraryLocation = useCallback(async () => {
    const selected = await pickFolder("Choose library location");
    if (!selected) return;

    startProgress("Scanning library...", cancelSync);

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("set_library_location", { path: selected });
      setLibraryLocation(selected);
      finishProgress("Library scan complete");
      onLibraryChanged();
    } catch (e) {
      failProgress(`Scan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress, onLibraryChanged]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="settings-backdrop" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[520px] max-w-[95vw] max-h-[80vh] flex flex-col"
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <UpdateSection />

          <div>
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">
              Library Location
            </span>
            <p className="text-[10px] text-text-tertiary mb-3">
              Your music library folder. Files are organized here as Artist / Album.
            </p>

            {loading ? (
              <div className="text-xs text-text-tertiary py-4 text-center">Loading...</div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-4 h-4 text-text-tertiary shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.06-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                  />
                </svg>
                <span className="text-xs text-text-secondary truncate flex-1 min-w-0">
                  {libraryLocation ?? "Not configured"}
                </span>
                <button
                  onClick={handleSetLibraryLocation}
                  className="text-[11px] text-accent hover:text-accent-hover transition-colors shrink-0"
                >
                  {libraryLocation ? "Change" : "Choose"}
                </button>
              </div>
            )}
          </div>

          {/* Theme */}
          <div className="mt-6">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">
              Theme
            </span>
            <p className="text-[10px] text-text-tertiary mb-3">Choose how Crate looks.</p>

            <div className="flex flex-col border border-border rounded-xl overflow-hidden divide-y divide-border">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-all text-left ${
                    theme === t.id ? "bg-bg-hover" : "hover:bg-bg-hover/50"
                  }`}
                >
                  {theme === t.id && <div className="w-0.5 h-4 bg-accent rounded-full shrink-0" />}
                  <span
                    className={`text-[11px] font-medium shrink-0 w-20 ${theme === t.id ? "text-accent" : "text-text-primary"}`}
                  >
                    {t.label}
                  </span>
                  <span className="text-[10px] text-text-tertiary flex-1 min-w-0 truncate">{t.description}</span>
                  <div className="flex gap-1 shrink-0">
                    {t.preview.map((color, i) => (
                      <div
                        key={i}
                        className="w-3.5 h-3.5 rounded-full border border-black/10"
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Custom themes */}
            {customThemes.length > 0 && (
              <div className="mt-3 flex flex-col border border-border rounded-xl overflow-hidden divide-y divide-border">
                {customThemes.map((t) => {
                  const isActive = theme === `custom:${t.id}`;
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-all ${isActive ? "bg-bg-hover" : ""}`}
                    >
                      {isActive && <div className="w-0.5 h-4 bg-accent rounded-full shrink-0" />}
                      <button onClick={() => setTheme(`custom:${t.id}`)} className="flex-1 text-left min-w-0">
                        <span className={`text-[11px] font-medium ${isActive ? "text-accent" : "text-text-primary"}`}>
                          {t.name}
                        </span>
                      </button>
                      <div className="flex gap-1 shrink-0">
                        {[t.background, t.accent, t.text].map((color, i) => (
                          <div
                            key={i}
                            className="w-3.5 h-3.5 rounded-full border border-black/10"
                            style={{ background: color }}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => setEditorState(t)}
                        className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
                        data-testid={`edit-theme-${t.id}`}
                      >
                        Edit
                      </button>
                      {confirmDeleteId === t.id ? (
                        <button
                          onClick={() => {
                            deleteCustomTheme(t.id);
                            setConfirmDeleteId(null);
                          }}
                          onBlur={() => setConfirmDeleteId(null)}
                          className="text-[10px] text-danger font-medium transition-colors"
                          data-testid={`confirm-delete-theme-${t.id}`}
                        >
                          Confirm?
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(t.id)}
                          className="text-[10px] text-text-tertiary hover:text-danger transition-colors"
                          data-testid={`delete-theme-${t.id}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {editorState !== null ? (
              <CustomThemeEditor
                initial={editorState === "new" ? undefined : editorState}
                existingNames={customThemes
                  .filter((t) => (editorState !== "new" ? t.id !== editorState.id : true))
                  .map((t) => t.name)}
                onSave={() => setEditorState(null)}
                onCancel={() => setEditorState(null)}
              />
            ) : (
              <button
                onClick={() => setEditorState("new")}
                className="mt-3 text-[11px] text-accent hover:text-accent-hover transition-colors"
                data-testid="create-theme-btn"
              >
                + Create Theme
              </button>
            )}
          </div>

          {/* Crossfade */}
          <div className="mt-6">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">
              Crossfade
            </span>
            <p className="text-[10px] text-text-tertiary mb-3">
              Smoothly blend between tracks. Set to 0 for gapless playback with no overlap.
            </p>

            <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
              <span className="text-[11px] text-text-tertiary shrink-0 w-8 text-right">
                {playbackState.crossfade === 0 ? "Off" : `${playbackState.crossfade}s`}
              </span>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={playbackState.crossfade}
                onChange={(e) => setCrossfade(Number(e.target.value))}
                className="flex-1 accent-accent h-1"
                data-testid="crossfade-slider"
              />
              <span className="text-[10px] text-text-tertiary shrink-0">12s</span>
            </div>
          </div>

          {/* Volume Normalization */}
          <div className="mt-6">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">
              Volume Normalization
            </span>
            <p className="text-[10px] text-text-tertiary mb-3">
              Adjust playback volume using ReplayGain tags so all tracks play at a consistent level. Does not modify
              your files.
            </p>

            <div className="flex flex-col gap-3 px-4 py-3 border border-border rounded-xl">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={playbackState.replayGainEnabled}
                  onChange={(e) => setReplayGain(e.target.checked)}
                  className="accent-accent w-3.5 h-3.5"
                  data-testid="replay-gain-toggle"
                />
                <span className="text-[11px] text-text-primary">Enable ReplayGain</span>
              </label>

              {playbackState.replayGainEnabled && (
                <div className="flex flex-col gap-2 pl-6">
                  <div className="flex items-center gap-4">
                    {(["track", "album"] as ReplayGainMode[]).map((mode) => (
                      <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="replayGainMode"
                          value={mode}
                          checked={playbackState.replayGainMode === mode}
                          onChange={() => setReplayGain(true, mode)}
                          className="accent-accent w-3 h-3"
                        />
                        <span className="text-[11px] text-text-secondary capitalize">{mode} gain</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[9px] text-text-tertiary leading-snug">
                    Track: every song at the same level — best for shuffle. Album: preserves volume differences between
                    songs on the same album — best for full-album listening.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Streaming */}
          <StreamingSettings />

          {/* Discover */}
          <DiscoverSettings />

          {/* Last.fm */}
          <LastfmSettings />
        </div>
      </div>
    </div>
  );
};
