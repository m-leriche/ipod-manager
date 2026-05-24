import { describe, it, expect, beforeEach } from "vitest";
import { deriveTheme, isDark, previewTheme, clearCustomThemeVars, applyCustomThemeVars } from "./themeColors";

describe("themeColors", () => {
  describe("isDark", () => {
    it("identifies dark colors", () => {
      expect(isDark("#000000")).toBe(true);
      expect(isDark("#121212")).toBe(true);
      expect(isDark("#1a1a2e")).toBe(true);
    });

    it("identifies light colors", () => {
      expect(isDark("#ffffff")).toBe(false);
      expect(isDark("#f4f4f6")).toBe(false);
      expect(isDark("#e8e8e8")).toBe(false);
    });

    it("handles mid-range colors", () => {
      expect(isDark("#808080")).toBe(false); // gray 128 → luminance ~0.5
      expect(isDark("#404040")).toBe(true); // dark gray
    });
  });

  describe("deriveTheme", () => {
    it("returns all 17 CSS variables", () => {
      const vars = deriveTheme("#121212", "#1db954", "#ffffff");
      expect(Object.keys(vars)).toHaveLength(17);
    });

    it("uses provided colors for primary values", () => {
      const vars = deriveTheme("#121212", "#1db954", "#ffffff");
      expect(vars["--color-bg-primary"]).toBe("#121212");
      expect(vars["--color-accent"]).toBe("#1db954");
      expect(vars["--color-text-primary"]).toBe("#ffffff");
    });

    it("uses dark status colors for dark backgrounds", () => {
      const vars = deriveTheme("#121212", "#1db954", "#ffffff");
      expect(vars["--color-success"]).toBe("#00c853");
      expect(vars["--color-warning"]).toBe("#ff9500");
      expect(vars["--color-danger"]).toBe("#ff3b30");
    });

    it("uses light status colors for light backgrounds", () => {
      const vars = deriveTheme("#f4f4f6", "#0066ff", "#1d1d1f");
      expect(vars["--color-success"]).toBe("#00a63e");
      expect(vars["--color-warning"]).toBe("#e68a00");
      expect(vars["--color-danger"]).toBe("#e6332a");
    });

    it("creates lighter card surface for dark backgrounds", () => {
      const vars = deriveTheme("#121212", "#1db954", "#ffffff");
      // bg-card should be brighter than bg-primary
      const primary = parseInt("121212", 16);
      const card = parseInt(vars["--color-bg-card"].slice(1), 16);
      expect(card).toBeGreaterThan(primary);
    });

    it("creates darker card surface for light backgrounds", () => {
      const vars = deriveTheme("#f4f4f6", "#0066ff", "#1d1d1f");
      const primary = parseInt("f4f4f6", 16);
      const card = parseInt(vars["--color-bg-card"].slice(1), 16);
      expect(card).toBeLessThan(primary);
    });

    it("text-secondary is between text-primary and background", () => {
      const vars = deriveTheme("#121212", "#1db954", "#ffffff");
      const textPri = parseInt("ffffff", 16);
      const textSec = parseInt(vars["--color-text-secondary"].slice(1), 16);
      const bg = parseInt("121212", 16);
      expect(textSec).toBeLessThan(textPri);
      expect(textSec).toBeGreaterThan(bg);
    });

    it("borders use text color with low alpha", () => {
      const vars = deriveTheme("#121212", "#1db954", "#ffffff");
      expect(vars["--color-border"]).toMatch(/^#ffffff[0-9a-f]{2}$/);
      expect(vars["--color-border-subtle"]).toMatch(/^#ffffff[0-9a-f]{2}$/);
      expect(vars["--color-border-active"]).toMatch(/^#ffffff[0-9a-f]{2}$/);
    });
  });

  describe("previewTheme / clearCustomThemeVars", () => {
    beforeEach(() => {
      clearCustomThemeVars();
    });

    it("sets inline CSS variables on document", () => {
      previewTheme("#1a1a2e", "#e94560", "#ffffff");
      expect(document.documentElement.style.getPropertyValue("--color-bg-primary")).toBe("#1a1a2e");
      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#e94560");
      expect(document.documentElement.style.getPropertyValue("--color-text-primary")).toBe("#ffffff");
    });

    it("clears all inline CSS variables", () => {
      previewTheme("#1a1a2e", "#e94560", "#ffffff");
      clearCustomThemeVars();
      expect(document.documentElement.style.getPropertyValue("--color-bg-primary")).toBe("");
      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("");
    });
  });

  describe("applyCustomThemeVars", () => {
    beforeEach(() => {
      clearCustomThemeVars();
    });

    it("applies a CustomTheme object", () => {
      applyCustomThemeVars({ id: "test", name: "Test", background: "#2d2d44", accent: "#ff6b6b", text: "#eaeaea" });
      expect(document.documentElement.style.getPropertyValue("--color-bg-primary")).toBe("#2d2d44");
      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#ff6b6b");
      expect(document.documentElement.style.getPropertyValue("--color-text-primary")).toBe("#eaeaea");
    });
  });
});
