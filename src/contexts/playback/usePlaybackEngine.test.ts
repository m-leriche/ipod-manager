import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../types/library";
import { usePlaybackEngine } from "./usePlaybackEngine";

const invokeMock = vi.mocked(invoke);

const track: LibraryTrack = {
  id: 1,
  file_path: "/music/song.flac",
  file_name: "song.flac",
  folder_path: "/music",
  title: "Song",
  artist: "Artist",
  album: "Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: null,
  genre: null,
  duration_secs: 200,
  sample_rate: null,
  bitrate_kbps: null,
  format: "flac",
  file_size: 1000,
  created_at: 0,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  compilation: false,
  replay_gain_track_db: null,
  replay_gain_album_db: null,
};

// Restore a persisted queue (paused, mid-track) from the SQLite-backed command.
const mockRestoredQueue = (position: number) => {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "load_playback_queue") {
      return Promise.resolve({
        tracks: [track],
        queue_index: 0,
        shuffle: false,
        repeat: "off",
        position,
      });
    }
    if (cmd === "check_library_available") return Promise.resolve(true);
    return Promise.resolve();
  });
};

describe("usePlaybackEngine cold resume", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
  });

  it("loads the restored track into the engine on the first resume after launch", async () => {
    mockRestoredQueue(87);
    const { result } = renderHook(() => usePlaybackEngine());

    // Wait for the queue to be restored from SQLite into state.
    await waitFor(() => expect(result.current.value.state.currentTrack?.id).toBe(1));
    expect(result.current.value.state.isPlaying).toBe(false);

    act(() => {
      result.current.value.resume();
    });

    // Cold resume must load the file (audio_play) at the saved position,
    // not call audio_resume on an engine that never loaded a track.
    expect(invokeMock).toHaveBeenCalledWith("audio_play", { path: "/music/song.flac", seekSecs: 87 });
    expect(invokeMock).not.toHaveBeenCalledWith("audio_resume");
    expect(result.current.value.state.isPlaying).toBe(true);
  });

  it("honors a seek made before the first play after launch", async () => {
    mockRestoredQueue(87);
    const { result } = renderHook(() => usePlaybackEngine());
    await waitFor(() => expect(result.current.value.state.currentTrack?.id).toBe(1));

    // User drags the seek bar (to 50% of a 200s track) before pressing Play.
    act(() => result.current.value.seekTo(0.5));
    act(() => result.current.value.resume());

    // Cold load must start from the sought position, not the saved position.
    expect(invokeMock).toHaveBeenCalledWith("audio_play", { path: "/music/song.flac", seekSecs: 100 });
  });

  it("resumes in place (audio_resume) on a later pause/play cycle", async () => {
    mockRestoredQueue(0);
    const { result } = renderHook(() => usePlaybackEngine());
    await waitFor(() => expect(result.current.value.state.currentTrack?.id).toBe(1));

    // First resume performs the cold load.
    act(() => result.current.value.resume());
    act(() => result.current.value.pause());
    invokeMock.mockClear();

    // Second resume should not reload the file — the engine already has it.
    act(() => result.current.value.resume());
    expect(invokeMock).toHaveBeenCalledWith("audio_resume");
    expect(invokeMock).not.toHaveBeenCalledWith("audio_play", expect.anything());
  });
});
