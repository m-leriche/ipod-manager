import type { CustomTheme } from "../types/customTheme";

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const rgbToHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

const mix = (hex1: string, hex2: string, amount: number): string => {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
};

const shiftRgb = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + amount, g + amount, b + amount);
};

const withAlpha = (hex: string, alpha: number): string =>
  hex +
  Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");

/** Perceived luminance (0-1). Dark < 0.5 < Light. */
export const isDark = (hex: string): boolean => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};

const CSS_VARS = [
  "--color-bg-primary",
  "--color-bg-secondary",
  "--color-bg-card",
  "--color-bg-elevated",
  "--color-bg-hover",
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-tertiary",
  "--color-accent",
  "--color-accent-hover",
  "--color-success",
  "--color-success-dim",
  "--color-warning",
  "--color-danger",
  "--color-border",
  "--color-border-subtle",
  "--color-border-active",
] as const;

export type ThemeVars = Record<(typeof CSS_VARS)[number], string>;

/** Derive all 17 CSS variables from 3 user-chosen colors. */
export const deriveTheme = (background: string, accent: string, text: string): ThemeVars => {
  const dark = isDark(background);

  return {
    "--color-bg-primary": background,
    "--color-bg-secondary": shiftRgb(background, dark ? -10 : -8),
    "--color-bg-card": shiftRgb(background, dark ? 8 : -14),
    "--color-bg-elevated": shiftRgb(background, dark ? 16 : -18),
    "--color-bg-hover": shiftRgb(background, dark ? 20 : -24),

    "--color-text-primary": text,
    "--color-text-secondary": mix(text, background, 0.45),
    "--color-text-tertiary": mix(text, background, 0.65),

    "--color-accent": accent,
    "--color-accent-hover": shiftRgb(accent, dark ? 20 : -20),

    "--color-success": dark ? "#00c853" : "#00a63e",
    "--color-success-dim": dark ? "#00c85322" : "#00a63e1a",
    "--color-warning": dark ? "#ff9500" : "#e68a00",
    "--color-danger": dark ? "#ff3b30" : "#e6332a",

    "--color-border": withAlpha(text, 0.05),
    "--color-border-subtle": withAlpha(text, 0.03),
    "--color-border-active": withAlpha(text, 0.1),
  };
};

/** Apply derived CSS variables as inline styles for live preview. */
export const previewTheme = (background: string, accent: string, text: string): void => {
  const vars = deriveTheme(background, accent, text);
  const el = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    el.style.setProperty(prop, value);
  }
};

/** Apply a saved custom theme's CSS variables. */
export const applyCustomThemeVars = (theme: CustomTheme): void => {
  previewTheme(theme.background, theme.accent, theme.text);
};

/** Remove all inline theme CSS variables. */
export const clearCustomThemeVars = (): void => {
  const el = document.documentElement;
  for (const prop of CSS_VARS) {
    el.style.removeProperty(prop);
  }
};
