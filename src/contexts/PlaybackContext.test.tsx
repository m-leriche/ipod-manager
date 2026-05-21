import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.unmock("./PlaybackContext");

// Mock the playback engine that PlaybackContext wraps
const mockValue = {
  state: {
    currentTrack: null,
    isPlaying: false,
    volume: 0.8,
    speed: 1.0,
    crossfade: 0,
    queue: [],
    queueIndex: -1,
    shuffle: false,
    repeat: "off" as const,
    libraryAvailable: true,
    playbackError: null,
  },
  playTrack: vi.fn(),
  playAlbum: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  addToQueue: vi.fn(),
  playNext: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  clearQueue: vi.fn(),
  toggleShuffle: vi.fn(),
  cycleRepeat: vi.fn(),
  setSpeed: vi.fn(),
  setCrossfade: vi.fn(),
  clearPlaybackError: vi.fn(),
};

const mockTime = { currentTime: 42, duration: 200 };

vi.mock("./playback/usePlaybackEngine", () => ({
  usePlaybackEngine: () => ({ value: mockValue, time: mockTime }),
}));

const { PlaybackProvider, usePlayback, usePlaybackTime } = await import("./PlaybackContext");

describe("PlaybackContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides playback state through usePlayback", () => {
    const { result } = renderHook(() => usePlayback(), {
      wrapper: ({ children }) => <PlaybackProvider>{children}</PlaybackProvider>,
    });

    expect(result.current.state.volume).toBe(0.8);
    expect(result.current.state.isPlaying).toBe(false);
    expect(result.current.state.currentTrack).toBeNull();
  });

  it("provides time state through usePlaybackTime", () => {
    const { result } = renderHook(() => usePlaybackTime(), {
      wrapper: ({ children }) => <PlaybackProvider>{children}</PlaybackProvider>,
    });

    expect(result.current.currentTime).toBe(42);
    expect(result.current.duration).toBe(200);
  });

  it("exposes all playback control methods", () => {
    const { result } = renderHook(() => usePlayback(), {
      wrapper: ({ children }) => <PlaybackProvider>{children}</PlaybackProvider>,
    });

    expect(typeof result.current.playTrack).toBe("function");
    expect(typeof result.current.pause).toBe("function");
    expect(typeof result.current.resume).toBe("function");
    expect(typeof result.current.next).toBe("function");
    expect(typeof result.current.previous).toBe("function");
    expect(typeof result.current.seekTo).toBe("function");
    expect(typeof result.current.setVolume).toBe("function");
    expect(typeof result.current.toggleShuffle).toBe("function");
    expect(typeof result.current.cycleRepeat).toBe("function");
    expect(typeof result.current.setSpeed).toBe("function");
    expect(typeof result.current.setCrossfade).toBe("function");
  });

  it("throws when usePlayback is used outside provider", () => {
    expect(() => {
      renderHook(() => usePlayback());
    }).toThrow("usePlayback must be used within PlaybackProvider");
  });

  it("returns default time values when usePlaybackTime is used outside provider", () => {
    const { result } = renderHook(() => usePlaybackTime());
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
  });
});
