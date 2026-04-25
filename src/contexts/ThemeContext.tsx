import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ThemeName = "dark" | "win95" | "classic" | "winamp" | "gameboy" | "aqua" | "msdos" | "terminal";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const STORAGE_KEY = "crate-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getStoredTheme = (): ThemeName => {
  const stored = localStorage.getItem(STORAGE_KEY);
  const valid: ThemeName[] = ["dark", "win95", "classic", "winamp", "gameboy", "aqua", "msdos", "terminal"];
  if (valid.includes(stored as ThemeName)) return stored as ThemeName;
  return "dark";
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeName>(getStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
};
