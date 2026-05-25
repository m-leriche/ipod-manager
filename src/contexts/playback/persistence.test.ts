import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  loadVolume,
  saveVolume,
  loadCrossfade,
  saveCrossfade,
  savePlaybackState,
  loadPlaybackState,
} from "./persistence";
import type { PlaybackState } from "./types";
import type { LibraryTrack } from "../../types/library";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

const stubTrack: LibraryTrack = {
  id: 1,
  file_path: "/music/song.flac",
  file_name: "song.flac",
  folder_path: "/music",
  file_size: 1000,
  duration_secs: 240,
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  genre: null,
  year: null,
  track_number: 1,
  track_total: null,
  disc_number: null,
  disc_total: null,
  sample_rate: 44100,
  bitrate_kbps: null,
  format: "flac",
  created_at: 0,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
};

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  // ── Volume ──────────────────────────────────────────────────

  it("loadVolume returns default 0.8 when not stored", () => {
    expect(loadVolume()).toBe(0.8);
  });

  it("saveVolume + loadVolume roundtrip", () => {
    saveVolume(0.5);
    expect(loadVolume()).toBe(0.5);
  });

  it("loadVolume ignores invalid values", () => {
    localStorage.setItem("crate-playback-volume", "not-a-number");
    expect(loadVolume()).toBe(0.8);
  });

  it("loadVolume ignores out-of-range values", () => {
    localStorage.setItem("crate-playback-volume", "2.0");
    expect(loadVolume()).toBe(0.8);
  });

  // ── Crossfade ──────────────────────────────────────────────

  it("loadCrossfade returns default 0 when not stored", () => {
    expect(loadCrossfade()).toBe(0);
  });

  it("saveCrossfade + loadCrossfade roundtrip", () => {
    saveCrossfade(6);
    expect(loadCrossfade()).toBe(6);
  });

  it("loadCrossfade ignores invalid values", () => {
    localStorage.setItem("crate-playback-crossfade", "abc");
    expect(loadCrossfade()).toBe(0);
  });

  it("loadCrossfade ignores out-of-range values", () => {
    localStorage.setItem("crate-playback-crossfade", "20");
    expect(loadCrossfade()).toBe(0);
  });

  it("loadCrossfade accepts boundary values", () => {
    saveCrossfade(0);
    expect(loadCrossfade()).toBe(0);
    saveCrossfade(12);
    expect(loadCrossfade()).toBe(12);
  });

  // ── Playback state (SQLite-backed) ─────────────────────────

  it("loadPlaybackState returns null when backend returns null", async () => {
    mockInvoke.mockResolvedValue(null);
    expect(await loadPlaybackState()).toBeNull();
  });

  it("loadPlaybackState returns null when backend returns empty tracks", async () => {
    mockInvoke.mockResolvedValue({ tracks: [], queue_index: 0, shuffle: false, repeat: "off", position: 0 });
    expect(await loadPlaybackState()).toBeNull();
  });

  it("loadPlaybackState resolves queue state from backend", async () => {
    mockInvoke.mockResolvedValue({
      tracks: [stubTrack],
      queue_index: 0,
      shuffle: true,
      repeat: "all",
      position: 120,
    });

    const loaded = await loadPlaybackState();
    expect(loaded).not.toBeNull();
    expect(loaded!.queue).toHaveLength(1);
    expect(loaded!.queueIndex).toBe(0);
    expect(loaded!.shuffle).toBe(true);
    expect(loaded!.repeat).toBe("all");
    expect(loaded!.position).toBe(120);
    expect(loaded!.currentTrack?.id).toBe(1);
  });

  it("loadPlaybackState clamps queue_index to valid range", async () => {
    mockInvoke.mockResolvedValue({
      tracks: [stubTrack],
      queue_index: 5,
      shuffle: false,
      repeat: "off",
      position: 0,
    });

    const loaded = await loadPlaybackState();
    expect(loaded!.queueIndex).toBe(0);
  });

  it("loadPlaybackState returns null on invoke error", async () => {
    mockInvoke.mockRejectedValue(new Error("DB error"));
    expect(await loadPlaybackState()).toBeNull();
  });

  it("savePlaybackState calls save_playback_queue with track ids", () => {
    const state: PlaybackState = {
      currentTrack: stubTrack,
      isPlaying: true,
      volume: 0.7,
      speed: 1.0,
      crossfade: 4,
      replayGainEnabled: false,
      replayGainMode: "track",
      queue: [stubTrack],
      queueIndex: 0,
      shuffle: true,
      repeat: "all",
      libraryAvailable: true,
      playbackError: null,
    };

    savePlaybackState(state, 120);
    expect(mockInvoke).toHaveBeenCalledWith("save_playback_queue", {
      trackIds: [1],
      queueIndex: 0,
      shuffle: true,
      repeat: "all",
      position: 120,
    });
  });

  it("savePlaybackState calls clear when no current track", () => {
    const state: PlaybackState = {
      currentTrack: null,
      isPlaying: false,
      volume: 0.8,
      speed: 1.0,
      crossfade: 0,
      replayGainEnabled: false,
      replayGainMode: "track",
      queue: [],
      queueIndex: -1,
      shuffle: false,
      repeat: "off",
      libraryAvailable: true,
      playbackError: null,
    };
    savePlaybackState(state, 0);
    expect(mockInvoke).toHaveBeenCalledWith("clear_playback_queue");
  });
});
