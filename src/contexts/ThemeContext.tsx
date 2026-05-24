import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getSetting, setSetting } from "../utils/settings";
import { applyCustomThemeVars, clearCustomThemeVars } from "../utils/themeColors";
import type { CustomTheme } from "../types/customTheme";

export type BuiltinThemeName = "dark" | "light" | "win95" | "classic" | "winamp" | "aqua" | "spotify";
export type ThemeId = BuiltinThemeName | `custom:${string}`;

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  customThemes: CustomTheme[];
  saveCustomTheme: (input: Omit<CustomTheme, "id"> & { id?: string }) => string;
  deleteCustomTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const BUILTIN_THEMES: BuiltinThemeName[] = ["dark", "light", "win95", "classic", "winamp", "aqua", "spotify"];

export const isBuiltinTheme = (t: string): t is BuiltinThemeName => BUILTIN_THEMES.includes(t as BuiltinThemeName);

const loadCustomThemes = (): CustomTheme[] => getSetting("customThemes");

const getStoredTheme = (): ThemeId => {
  const stored = getSetting("theme");
  if (isBuiltinTheme(stored)) return stored;
  if (stored.startsWith("custom:")) {
    const id = stored.slice(7);
    if (loadCustomThemes().some((t) => t.id === id)) return stored as ThemeId;
  }
  return "dark";
};

const generateId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeId>(getStoredTheme);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(loadCustomThemes);

  useEffect(() => {
    if (isBuiltinTheme(theme)) {
      clearCustomThemeVars();
      document.documentElement.setAttribute("data-theme", theme);
    } else if (theme.startsWith("custom:")) {
      const id = theme.slice(7);
      const custom = customThemes.find((t) => t.id === id);
      if (custom) {
        document.documentElement.setAttribute("data-theme", "custom");
        applyCustomThemeVars(custom);
      }
    }
    setSetting("theme", theme);
  }, [theme, customThemes]);

  const setTheme = useCallback((t: ThemeId) => setThemeState(t), []);

  const saveCustomTheme = useCallback((input: Omit<CustomTheme, "id"> & { id?: string }): string => {
    const id = input.id ?? generateId();
    const saved: CustomTheme = {
      id,
      name: input.name,
      background: input.background,
      accent: input.accent,
      text: input.text,
    };
    setCustomThemes((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = idx >= 0 ? [...prev.slice(0, idx), saved, ...prev.slice(idx + 1)] : [...prev, saved];
      setSetting("customThemes", next);
      return next;
    });
    return id;
  }, []);

  const deleteCustomTheme = useCallback((id: string) => {
    setCustomThemes((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setSetting("customThemes", next);
      return next;
    });
    setThemeState((current) => (current === `custom:${id}` ? "dark" : current));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, customThemes, saveCustomTheme, deleteCustomTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
};
