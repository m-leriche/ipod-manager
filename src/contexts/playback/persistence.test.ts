import { describe, it, expect, beforeEach } from "vitest";
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
  flagged: false,
  rating: 0,
};

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
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

  // ── Playback state ─────────────────────────────────────────

  it("loadPlaybackState returns null when not stored", () => {
    expect(loadPlaybackState()).toBeNull();
  });

  it("savePlaybackState + loadPlaybackState roundtrip", () => {
    const state: PlaybackState = {
      currentTrack: stubTrack,
      isPlaying: true,
      volume: 0.7,
      speed: 1.0,
      crossfade: 4,
      queue: [stubTrack],
      queueIndex: 0,
      shuffle: true,
      repeat: "all",
      libraryAvailable: true,
      playbackError: null,
    };

    savePlaybackState(state, 120);
    const loaded = loadPlaybackState();
    expect(loaded).not.toBeNull();
    expect(loaded!.queueIndex).toBe(0);
    expect(loaded!.shuffle).toBe(true);
    expect(loaded!.repeat).toBe("all");
    expect(loaded!.position).toBe(120);
    expect(loaded!.currentTrack?.id).toBe(1);
  });

  it("savePlaybackState removes state when no current track", () => {
    saveCrossfade(4);
    const state: PlaybackState = {
      currentTrack: null,
      isPlaying: false,
      volume: 0.8,
      speed: 1.0,
      crossfade: 0,
      queue: [],
      queueIndex: -1,
      shuffle: false,
      repeat: "off",
      libraryAvailable: true,
      playbackError: null,
    };
    savePlaybackState(state, 0);
    expect(loadPlaybackState()).toBeNull();
  });

  it("loadPlaybackState returns null for malformed JSON", () => {
    localStorage.setItem("crate-playback-state", "{bad json");
    expect(loadPlaybackState()).toBeNull();
  });
});
