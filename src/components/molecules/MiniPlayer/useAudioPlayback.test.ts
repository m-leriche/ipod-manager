import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAudioPlayback } from "./useAudioPlayback";

// Mock HTMLAudioElement
let mockAudio: {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  src: string;
  currentTime: number;
  duration: number;
};

beforeEach(() => {
  mockAudio = {
    play: vi.fn(),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    src: "",
    currentTime: 0,
    duration: 120,
  };

  // Must use `function` (not arrow) so it's valid as a constructor with `new`
  vi.stubGlobal(
    "Audio",
    vi.fn(function () {
      return mockAudio;
    }),
  );
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

  it("creates Audio element when filePath is provided", () => {
    renderHook(() => useAudioPlayback("/music/song.flac"));
    expect(globalThis.Audio).toHaveBeenCalled();
    expect(mockAudio.addEventListener).toHaveBeenCalledWith("loadedmetadata", expect.any(Function));
    expect(mockAudio.addEventListener).toHaveBeenCalledWith("ended", expect.any(Function));
  });

  it("play sets isPlaying to true", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    expect(mockAudio.play).toHaveBeenCalled();
  });

  it("pause sets isPlaying to false", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.play());
    act(() => result.current.pause());
    expect(result.current.isPlaying).toBe(false);
    expect(mockAudio.pause).toHaveBeenCalled();
  });

  it("stop resets to beginning", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.play());
    act(() => result.current.stop());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(mockAudio.currentTime).toBe(0);
  });

  it("seekTo sets currentTime as fraction of duration", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.seekTo(0.5));
    expect(mockAudio.currentTime).toBe(60); // 0.5 * 120
  });

  it("seekTo ignores non-finite values", () => {
    mockAudio.duration = NaN;
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.seekTo(0.5));
    expect(mockAudio.currentTime).toBe(0); // unchanged
  });

  it("cleans up audio on filePath change", () => {
    const { rerender } = renderHook(({ path }) => useAudioPlayback(path), {
      initialProps: { path: "/a.flac" as string | null },
    });
    expect(mockAudio.addEventListener).toHaveBeenCalledTimes(2);

    rerender({ path: null });
    expect(mockAudio.pause).toHaveBeenCalled();
    expect(mockAudio.removeEventListener).toHaveBeenCalledWith("loadedmetadata", expect.any(Function));
    expect(mockAudio.removeEventListener).toHaveBeenCalledWith("ended", expect.any(Function));
  });

  it("updates duration on loadedmetadata event", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));

    const loadedCall = mockAudio.addEventListener.mock.calls.find((c: string[]) => c[0] === "loadedmetadata");
    expect(loadedCall).toBeDefined();
    act(() => loadedCall![1]());

    expect(result.current.duration).toBe(120);
  });

  it("resets on ended event", () => {
    const { result } = renderHook(() => useAudioPlayback("/music/song.flac"));
    act(() => result.current.play());

    const endedCall = mockAudio.addEventListener.mock.calls.find((c: string[]) => c[0] === "ended");
    act(() => endedCall![1]());

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
  });
});
