import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAudioPlayback } from "./useAudioPlayback";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue(undefined);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

describe("useAudioPlayback", () => {
  it("returns idle state when filePath is null", () => {
    const { result } = renderHook(() => useAudioPlayback(null));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.playbackFraction).toBe(0);
  });

  it("does not call audio_stop when filePath is null and nothing was played", () => {
    renderHook(() => useAudioPlayback(null));
    expect(mockInvoke).not.toHaveBeenCalledWith("audio_stop");
  });

  it("play invokes audio_play with file path", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("audio_play", {
      path: "/music/song.flac",
      seekSecs: null,
    });
  });

  it("pause invokes audio_pause", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.play());
    act(() => result.current.pause());
    expect(result.current.isPlaying).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith("audio_pause");
  });

  it("stop invokes audio_stop and resets state", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.play());
    act(() => result.current.stop());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(mockInvoke).toHaveBeenCalledWith("audio_stop");
  });

  it("seekTo invokes audio_seek with correct time", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    // Simulate duration being set (would come from Rust events in real usage)
    // Duration starts at 0, so seekTo with fraction produces 0
    act(() => result.current.seekTo(0.5));
    // With duration=0, 0.5*0=0, which is finite
    expect(mockInvoke).toHaveBeenCalledWith("audio_seek", { positionSecs: 0 });
  });

  it("cleans up on filePath change only after play was called", () => {
    const { result, rerender } = renderHook(({ path }) => useAudioPlayback(path), {
      initialProps: { path: "/a.flac" as string | null },
    });
    // Without calling play, changing path should not stop
    mockInvoke.mockClear();
    rerender({ path: null });
    expect(mockInvoke).not.toHaveBeenCalledWith("audio_stop");

    // After calling play, changing path should stop
    rerender({ path: "/b.flac" });
    act(() => result.current.play());
    mockInvoke.mockClear();
    rerender({ path: null });
    expect(mockInvoke).toHaveBeenCalledWith("audio_stop");
  });

  it("play does nothing when filePath is null", () => {
    const { result } = renderHook(() => useAudioPlayback(null));
    mockInvoke.mockClear();
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith("audio_play", expect.anything());
  });
});
