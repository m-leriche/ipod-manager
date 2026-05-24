import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../../contexts/ThemeContext";
import { previewTheme, clearCustomThemeVars } from "../../../utils/themeColors";
import type { CustomTheme } from "../../../types/customTheme";

interface CustomThemeEditorProps {
  initial?: CustomTheme;
  onSave: () => void;
  onCancel: () => void;
}

const ColorPicker = ({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) => (
  <div className="flex-1">
    <label className="text-[10px] text-text-tertiary block mb-1">{label}</label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
        data-testid={testId}
      />
      <span className="text-[10px] text-text-tertiary font-mono">{value}</span>
    </div>
  </div>
);

export const CustomThemeEditor = ({ initial, onSave, onCancel }: CustomThemeEditorProps) => {
  const { theme: currentTheme, setTheme, saveCustomTheme } = useTheme();
  const previousTheme = useRef(currentTheme);

  const [name, setName] = useState(initial?.name ?? "");
  const [background, setBackground] = useState(initial?.background ?? "#121212");
  const [accent, setAccent] = useState(initial?.accent ?? "#0066ff");
  const [text, setText] = useState(initial?.text ?? "#ffffff");

  // Live preview: apply colors as user picks them
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "custom");
    previewTheme(background, accent, text);
  }, [background, accent, text]);

  // Cleanup: clear inline vars on unmount so the next theme can apply cleanly
  useEffect(() => {
    return () => clearCustomThemeVars();
  }, []);

  const handleSave = () => {
    const id = saveCustomTheme({ id: initial?.id, name: name.trim(), background, accent, text });
    setTheme(`custom:${id}`);
    onSave();
  };

  const handleCancel = () => {
    setTheme(previousTheme.current);
    onCancel();
  };

  return (
    <div className="mt-3 px-4 py-3 border border-border rounded-xl space-y-3" data-testid="custom-theme-editor">
      <div>
        <label className="text-[10px] text-text-tertiary block mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Theme"
          className="w-full px-3 py-1.5 text-xs bg-bg-card border border-border rounded-lg text-text-primary"
          maxLength={30}
          data-testid="theme-name-input"
        />
      </div>

      <div className="flex gap-4">
        <ColorPicker label="Background" value={background} onChange={setBackground} testId="theme-bg-picker" />
        <ColorPicker label="Accent" value={accent} onChange={setAccent} testId="theme-accent-picker" />
        <ColorPicker label="Text" value={text} onChange={setText} testId="theme-text-picker" />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={handleCancel}
          className="text-[11px] text-text-secondary hover:text-text-primary transition-colors px-2 py-1"
          data-testid="theme-cancel-btn"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="text-[11px] text-accent hover:text-accent-hover transition-colors px-2 py-1 disabled:opacity-40"
          data-testid="theme-save-btn"
        >
          Save
        </button>
      </div>
    </div>
  );
};
