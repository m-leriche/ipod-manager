import { test as base } from "@playwright/test";
import path from "path";

/**
 * Default responses for all Tauri invoke commands.
 * Covers every command the app calls so it can boot cleanly.
 */
const DEFAULT_RESPONSES: Record<string, unknown> = {
  // Device
  detect_ipod: null,
  mount_ipod: null,
  unmount_ipod: null,
  get_ipod_info: null,
  read_rockbox_playdata: null,

  // Library
  get_library_location: null,
  check_library_available: true,
  set_library_location: null,
  refresh_library: null,
  add_library_folder: null,
  remove_library_folder: null,
  import_to_library: { imported: 0, skipped: 0, errors: [] },
  delete_library_tracks: null,
  get_library_tracks: [],
  get_library_browser_data: { tracks: [], genres: [], artists: [], albums: [] },
  get_library_artists: [],
  get_library_albums: [],
  get_library_genres: [],
  search_library: [],
  flag_tracks: null,
  increment_play_count: null,

  // Playlists
  get_playlists: [],
  get_playlist_tracks: [],
  create_playlist: { id: "new-playlist", name: "New Playlist", track_count: 0 },
  rename_playlist: null,
  delete_playlist: null,
  add_tracks_to_playlist: null,
  remove_tracks_from_playlist: null,
  move_playlist_track: null,
  export_playlists_to_ipod: { exported: 0, errors: [] },

  // Profiles
  get_profiles: { profiles: [] },
  save_profiles: null,
  get_browse_profiles: { profiles: [] },
  save_browse_profiles: null,

  // File operations
  list_directory: [],
  compare_directories: [],
  copy_files: { completed: 0, failed: 0, errors: [] },
  delete_files: { completed: 0, failed: 0, errors: [] },
  move_files: { completed: 0, failed: 0, errors: [] },
  delete_entry: null,
  rename_entry: null,
  create_folder: null,
  cancel_sync: null,

  // Metadata
  scan_metadata: [],
  scan_metadata_paths: [],
  save_metadata: { saved: 0, errors: [] },
  repair_analyze: { albums: [] },
  repair_compare_release: { tracks: [], matched: false },
  sanitize_tags: { processed: 0, cleaned: 0, errors: [] },

  // Audio quality
  scan_audio_quality: [],
  generate_spectrogram: { path: "" },
  generate_waveform: { path: "" },

  // Album art
  scan_album_art: [],
  fix_album_art: { fixed: 0, failed: 0, errors: [] },

  // Audio playback
  audio_play: null,
  audio_pause: null,
  audio_resume: null,
  audio_stop: null,
  audio_seek: null,
  audio_set_volume: null,
  audio_preload_next: null,
  audio_get_status: null,
  audio_set_eq: null,

  // Media keys
  media_set_metadata: null,
  media_set_playback: null,

  // YouTube / video
  check_yt_dependencies: null,
  check_ffmpeg: null,
  fetch_video_info: null,
  download_audio: null,
  probe_video: null,
  extract_audio_from_video: null,
  get_accurate_duration: 0,

  // Library stats
  scan_library_stats: null,
  get_library_stats: null,
};

type CommandOverrides = Record<string, unknown>;

const INIT_SCRIPT_PATH = path.join(import.meta.dirname, "tauri-init.js");

/**
 * Custom Playwright test fixture with Tauri mocking built in.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/tauri-mocks";
 *
 *   test("app loads", async ({ page }) => { ... });
 *
 *   // Override specific commands before navigating:
 *   test("with library data", async ({ page, tauriMocks }) => {
 *     await tauriMocks.override({ get_library_tracks: [...] });
 *     await page.goto("/");
 *   });
 */
export const test = base.extend<{
  tauriMocks: {
    /** Set overrides BEFORE page.goto() — takes effect on next navigation */
    override: (overrides: CommandOverrides) => Promise<void>;
    /** Update command responses at runtime on the CURRENT page (no reload needed) */
    setResponses: (overrides: CommandOverrides) => Promise<void>;
    /** Emit a Tauri event on the current page */
    emitEvent: (event: string, payload: unknown) => Promise<void>;
  };
}>({
  tauriMocks: [
    async ({ page }, use) => {
      // Step 1: Set response data on window before the init script reads it
      await page.addInitScript((json) => {
        (window as any).__TAURI_MOCK_RESPONSES__ = JSON.parse(json);
      }, JSON.stringify(DEFAULT_RESPONSES));

      // Step 2: Run the init script that sets up __TAURI_INTERNALS__
      await page.addInitScript({ path: INIT_SCRIPT_PATH });

      await use({
        override: async (overrides: CommandOverrides) => {
          const merged = { ...DEFAULT_RESPONSES, ...overrides };
          await page.addInitScript((json) => {
            (window as any).__TAURI_MOCK_RESPONSES__ = JSON.parse(json);
          }, JSON.stringify(merged));
          await page.addInitScript({ path: INIT_SCRIPT_PATH });
        },
        setResponses: async (overrides: CommandOverrides) => {
          await page.evaluate((json) => {
            (window as any).__TAURI_MOCK_SET_RESPONSES__(JSON.parse(json));
          }, JSON.stringify(overrides));
        },
        emitEvent: async (event: string, payload: unknown) => {
          await page.evaluate(
            ([e, p]) => {
              (window as any).__TAURI_MOCK_EMIT__(e, p);
            },
            [event, payload] as const,
          );
        },
      });
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
