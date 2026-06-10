import { useState } from "react";
import { useTheme } from "../../../contexts/ThemeContext";
import type { BuiltinThemeName } from "../../../contexts/ThemeContext";
import type { CustomTheme } from "../../../types/customTheme";
import { CustomThemeEditor } from "./CustomThemeEditor";
import { SettingGroup } from "./SettingGroup";

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

export const AppearanceSection = () => {
  const { theme, setTheme, customThemes, deleteCustomTheme } = useTheme();
  const [editorState, setEditorState] = useState<CustomTheme | "new" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <SettingGroup title="Theme" description="Choose how Crate looks." first>
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
    </SettingGroup>
  );
};
