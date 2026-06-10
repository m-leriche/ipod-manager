import { describe, it, expect, beforeEach } from "vitest";
import { getSetting, setSetting, SETTINGS } from "./settings";

describe("settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default value when nothing is stored", () => {
    expect(getSetting("volume")).toBe(0.8);
    expect(getSetting("speed")).toBe(1.0);
    expect(getSetting("theme")).toBe("dark");
    expect(getSetting("showColumnBrowser")).toBe(true);
    expect(getSetting("showStatsPanel")).toBe(false);
  });

  it("persists and retrieves a number setting", () => {
    setSetting("volume", 0.5);
    expect(getSetting("volume")).toBe(0.5);
  });

  it("persists and retrieves a boolean setting", () => {
    setSetting("showStatsPanel", true);
    expect(getSetting("showStatsPanel")).toBe(true);
  });

  it("persists and retrieves a string setting", () => {
    setSetting("theme", "winamp");
    expect(getSetting("theme")).toBe("winamp");
  });

  it("persists and retrieves a JSON setting", () => {
    const widths = { title: 200, artist: 150 };
    setSetting("columnWidths", widths);
    expect(getSetting("columnWidths")).toEqual(widths);
  });

  it("clamps number values via validation", () => {
    // Set raw localStorage to out-of-range value
    localStorage.setItem(SETTINGS.volume.key, "5.0");
    expect(getSetting("volume")).toBe(0.8); // Falls back to default
  });

  it("returns default for corrupt JSON", () => {
    localStorage.setItem(SETTINGS.columnWidths.key, "not-valid-json{");
    expect(getSetting("columnWidths")).toEqual({});
  });

  it("returns default for invalid boolean", () => {
    localStorage.setItem(SETTINGS.showColumnBrowser.key, "maybe");
    expect(getSetting("showColumnBrowser")).toBe(true); // default
  });

  it("stores to correct localStorage keys", () => {
    setSetting("speed", 1.5);
    expect(localStorage.getItem("crate-playback-speed")).toBe("1.5");
  });

  it("has all expected settings keys", () => {
    const keys = Object.keys(SETTINGS);
    expect(keys).toContain("theme");
    expect(keys).toContain("volume");
    expect(keys).toContain("crossfade");
    expect(keys).toContain("speed");
    expect(keys).toContain("showColumnBrowser");
    expect(keys).toContain("sortBy");
    expect(keys).toContain("columnWidths");
  });

  it("rejects invalid values for constrained str settings", () => {
    localStorage.setItem(SETTINGS.sortDirection.key, "garbage");
    expect(getSetting("sortDirection")).toBe("asc"); // Falls back to default

    localStorage.setItem(SETTINGS.albumSortMode.key, "invalid");
    expect(getSetting("albumSortMode")).toBe("album"); // Falls back to default
  });

  it("accepts valid values for constrained str settings", () => {
    setSetting("sortDirection", "desc");
    expect(getSetting("sortDirection")).toBe("desc");

    setSetting("albumSortMode", "year");
    expect(getSetting("albumSortMode")).toBe("year");
  });

  it("validates JSON settings with custom validators", () => {
    // columnWidths rejects non-object
    localStorage.setItem(SETTINGS.columnWidths.key, '"not-an-object"');
    expect(getSetting("columnWidths")).toEqual({});

    // browserColumnWidths rejects non-number arrays
    localStorage.setItem(SETTINGS.browserColumnWidths.key, '["a","b"]');
    expect(getSetting("browserColumnWidths")).toEqual([]);
  });

  it("filters metadata templates with non-whitelisted fields", () => {
    const valid = { id: "a", name: "Good", fields: { genre: "Jazz" } };
    const badField = { id: "b", name: "Bad", fields: { title: "Hijack" } };
    const badValue = { id: "c", name: "Bad", fields: { genre: 42 } };
    localStorage.setItem(SETTINGS.metadataTemplates.key, JSON.stringify([valid, badField, badValue]));

    expect(getSetting("metadataTemplates")).toEqual([valid]);
  });

  it("lyricsOverlaySize defaults to 1 (multiplier)", () => {
    expect(getSetting("lyricsOverlaySize")).toBe(1);
    setSetting("lyricsOverlaySize", 1.5);
    expect(getSetting("lyricsOverlaySize")).toBe(1.5);
  });
});
