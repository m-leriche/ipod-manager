/**
 * Unified settings persistence layer.
 *
 * All user preferences stored in localStorage are defined here with their
 * keys, types, and defaults. Components use `getSetting` / `setSetting`
 * instead of touching localStorage directly.
 */

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

const str = (key: string, defaultValue: string): SettingDef<string> => ({
  key,
  defaultValue,
  parse: (raw) => raw,
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

export const SETTINGS = {
  // Theme
  theme: str("crate-theme", "dark"),

  // Playback
  volume: num("crate-playback-volume", 0.8, 0, 1),
  crossfade: num("crate-playback-crossfade", 0, 0, 12),
  speed: num("crate-playback-speed", 1.0, 0.25, 4),

  // Equalizer
  equalizer: json("crate-equalizer", null as unknown),
  equalizerPresets: json("crate-equalizer-presets", [] as unknown[]),

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
  showFullscreenVisualizer: bool("crate-show-fullscreen-visualizer", false),

  // Library sorting/filtering
  sortBy: str("crate-sort-by", "artist"),
  sortDirection: str("crate-sort-direction", "asc"),
  flaggedFilter: bool("crate-flagged-filter", false),
  albumSortMode: str("crate-album-sort-mode", "album"),

  // Layout dimensions
  columnWidths: json("crate-column-widths", {} as Record<string, number>),
  columnOrder: json("crate-column-order", [] as string[]),
  browserColumnWidths: json("crate-browser-column-widths", null as number[] | null),
  lyricsPanelWidth: num("crate-lyrics-panel-width", 280, 0, 10000),
  detailPanelWidth: num("crate-detail-panel-width", 220, 0, 10000),
  albumGridHeight: num("crate-album-grid-height", 0.4, 0, 1),
  lyricsOverlaySize: num("crate-lyrics-overlay-size", 18, 8, 72),
} as const;

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
