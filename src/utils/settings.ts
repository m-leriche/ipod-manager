/**
 * Unified settings persistence layer.
 *
 * All user preferences stored in localStorage are defined here with their
 * keys, types, and defaults. Components use `getSetting` / `setSetting`
 * instead of touching localStorage directly.
 */

import type { CustomTheme } from "../types/customTheme";
import type { ShortcutBinding } from "../types/shortcuts";
import { TEMPLATE_FIELDS } from "../types/metadata";
import type { MetadataTemplate } from "../types/metadata";

// ── Schema ──────────────────────────────────────────────────────

interface SettingDef<T> {
  key: string;
  defaultValue: T;
  parse: (raw: string) => T | undefined;
  serialize: (value: T) => string;
}

const bool = (key: string, defaultValue: boolean): SettingDef<boolean> => ({
  key,
  defaultValue,
  parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
  serialize: String,
});

const num = (key: string, defaultValue: number, min: number, max: number): SettingDef<number> => ({
  key,
  defaultValue,
  parse: (raw) => {
    const v = parseFloat(raw);
    return isFinite(v) && v >= min && v <= max ? v : undefined;
  },
  serialize: String,
});

const str = (key: string, defaultValue: string, allowed?: string[]): SettingDef<string> => ({
  key,
  defaultValue,
  parse: (raw) => (allowed ? (allowed.includes(raw) ? raw : undefined) : raw),
  serialize: (v) => v,
});

const json = <T>(key: string, defaultValue: T, validate?: (parsed: unknown) => T | undefined): SettingDef<T> => ({
  key,
  defaultValue,
  parse: (raw) => {
    try {
      const parsed = JSON.parse(raw);
      return validate ? validate(parsed) : (parsed as T);
    } catch {
      return undefined;
    }
  },
  serialize: (v) => JSON.stringify(v),
});

// ── All settings ────────────────────────────────────────────────

/** Validate that parsed JSON is a Record<string, number>. */
const validateNumberRecord = (parsed: unknown): Record<string, number> | undefined => {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  for (const v of Object.values(obj)) {
    if (typeof v !== "number") return undefined;
  }
  return obj as Record<string, number>;
};

/** Validate that parsed JSON is a Record<string, boolean>. */
const validateBooleanRecord = (parsed: unknown): Record<string, boolean> | undefined => {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  for (const v of Object.values(obj)) {
    if (typeof v !== "boolean") return undefined;
  }
  return obj as Record<string, boolean>;
};

/** Validate that parsed JSON is a string[]. */
const validateStringArray = (parsed: unknown): string[] | undefined => {
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return undefined;
  return parsed as string[];
};

/** Validate that parsed JSON is a number[]. */
const validateNumberArray = (parsed: unknown): number[] | undefined => {
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "number" && isFinite(v))) return undefined;
  return parsed as number[];
};

const isShortcutBinding = (b: unknown): b is ShortcutBinding =>
  typeof b === "object" &&
  b !== null &&
  typeof (b as ShortcutBinding).code === "string" &&
  typeof (b as ShortcutBinding).mod === "boolean" &&
  typeof (b as ShortcutBinding).shift === "boolean" &&
  typeof (b as ShortcutBinding).alt === "boolean";

/** Validate that parsed JSON is a Record<string, ShortcutBinding>. */
const validateShortcutOverrides = (parsed: unknown): Record<string, ShortcutBinding> | undefined => {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  for (const v of Object.values(obj)) {
    if (!isShortcutBinding(v)) return undefined;
  }
  return obj as Record<string, ShortcutBinding>;
};

const isMetadataTemplate = (t: unknown): t is MetadataTemplate =>
  typeof t === "object" &&
  t !== null &&
  typeof (t as MetadataTemplate).id === "string" &&
  typeof (t as MetadataTemplate).name === "string" &&
  typeof (t as MetadataTemplate).fields === "object" &&
  (t as MetadataTemplate).fields !== null &&
  Object.entries((t as MetadataTemplate).fields).every(
    ([k, v]) => (TEMPLATE_FIELDS as readonly string[]).includes(k) && typeof v === "string",
  );

const isCustomTheme = (t: unknown): t is CustomTheme =>
  typeof t === "object" &&
  t !== null &&
  typeof (t as CustomTheme).id === "string" &&
  typeof (t as CustomTheme).name === "string" &&
  typeof (t as CustomTheme).background === "string" &&
  typeof (t as CustomTheme).accent === "string" &&
  typeof (t as CustomTheme).text === "string";

export const SETTINGS = {
  // Theme
  theme: str("crate-theme", "dark"),
  customThemes: json<CustomTheme[]>("crate-custom-themes", [], (parsed) =>
    Array.isArray(parsed) ? parsed.filter(isCustomTheme) : undefined,
  ),

  // Playback
  volume: num("crate-playback-volume", 0.8, 0, 1),
  crossfade: num("crate-playback-crossfade", 0, 0, 12),
  speed: num("crate-playback-speed", 1.0, 0.25, 4),
  replayGainEnabled: bool("crate-replay-gain-enabled", false),
  replayGainMode: str("crate-replay-gain-mode", "track", ["track", "album"]),

  // Equalizer — stored as opaque JSON blobs; callers validate structure on read
  equalizer: json<Record<string, unknown> | null>("crate-equalizer", null, (parsed) =>
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined,
  ),
  equalizerPresets: json<EqPresetStored[]>("crate-equalizer-presets", [], (parsed) =>
    Array.isArray(parsed) ? (parsed as EqPresetStored[]) : undefined,
  ),

  // Panel visibility
  showColumnBrowser: bool("crate-show-column-browser", true),
  showInfoPanel: bool("crate-show-info-panel", true),
  showStatsPanel: bool("crate-show-stats-panel", false),
  showPlaylistSidebar: bool("crate-show-playlist-sidebar", true),
  showAlbumGrid: bool("crate-show-album-grid", false),
  showTrackList: bool("crate-show-track-list", true),
  showLyricsPanel: bool("crate-show-lyrics-panel", false),
  showArtworkCarousel: bool("crate-show-artwork-carousel", false),
  lyricsOverlay: bool("crate-lyrics-overlay", false),

  // Library sorting/filtering
  sortBy: str("crate-sort-by", "artist"),
  sortDirection: str("crate-sort-direction", "asc", ["asc", "desc"]),
  flaggedFilter: bool("crate-flagged-filter", false),
  albumSortMode: str("crate-album-sort-mode", "album", ["album", "artist", "year", "recent", "alpha"]),

  // Onboarding
  tourCompleted: bool("crate-tour-completed", false),

  // Startup behavior
  resumeQueueOnLaunch: bool("crate-resume-queue-on-launch", true),
  rememberLastTab: bool("crate-remember-last-tab", false),
  lastTopTab: str("crate-last-top-tab", "library", ["library", "discover", "inbox", "tools"]),

  // Auto-fetch after library imports
  autoFetchAlbumArt: bool("crate-auto-fetch-album-art", false),
  autoFetchLyrics: bool("crate-auto-fetch-lyrics", false),

  // Keyboard shortcut overrides (action → binding); defaults live in utils/shortcuts.ts
  shortcutOverrides: json<Record<string, ShortcutBinding>>("crate-shortcut-overrides", {}, validateShortcutOverrides),

  // Metadata templates (batch tag presets)
  metadataTemplates: json<MetadataTemplate[]>("crate-metadata-templates", [], (parsed) =>
    Array.isArray(parsed) ? parsed.filter(isMetadataTemplate) : undefined,
  ),

  // Layout dimensions
  columnWidths: json<Record<string, number>>("crate-column-widths", {}, validateNumberRecord),
  columnOrder: json<string[]>("crate-column-order", [], validateStringArray),
  // Per-column show/hide overrides; columns absent from the map use their
  // default, so newly added default-visible columns appear for everyone.
  columnVisibility: json<Record<string, boolean>>("crate-column-visibility", {}, validateBooleanRecord),
  browserColumnWidths: json<number[]>("crate-browser-column-widths", [], validateNumberArray),
  releasesColumnWidths: json<number[]>("crate-releases-column-widths", [], validateNumberArray),
  lyricsPanelWidth: num("crate-lyrics-panel-width", 280, 0, 10000),
  detailPanelWidth: num("crate-detail-panel-width", 220, 0, 10000),
  lyricsOverlaySize: num("crate-lyrics-overlay-size", 1, 0.5, 2),
} as const;

/** Stored shape for EQ presets (matches EqPreset from EqualizerPanel/types). */
interface EqPresetStored {
  name: string;
  gains: number[];
  preamp: number;
  bandMode?: string;
}

// ── API ─────────────────────────────────────────────────────────

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]["defaultValue"];

export const getSetting = <K extends SettingKey>(key: K): SettingValue<K> => {
  const def = SETTINGS[key] as SettingDef<SettingValue<K>>;
  const raw = localStorage.getItem(def.key);
  if (raw === null) return def.defaultValue;
  const parsed = def.parse(raw);
  return parsed !== undefined ? parsed : def.defaultValue;
};

export const setSetting = <K extends SettingKey>(key: K, value: SettingValue<K>) => {
  const def = SETTINGS[key] as SettingDef<SettingValue<K>>;
  localStorage.setItem(def.key, def.serialize(value));
};
