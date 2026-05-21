import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getSetting, setSetting } from "../utils/settings";

export type ThemeName = "dark" | "win95" | "classic" | "winamp" | "aqua" | "spotify";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const VALID_THEMES: ThemeName[] = ["dark", "win95", "classic", "winamp", "aqua", "spotify"];

const getStoredTheme = (): ThemeName => {
  const stored = getSetting("theme") as ThemeName;
  return VALID_THEMES.includes(stored) ? stored : "dark";
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeName>(getStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    setSetting("theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
};
