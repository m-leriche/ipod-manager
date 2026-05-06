import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoverFlowLyrics } from "./CoverFlowLyrics";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockTrack = {
  id: 1,
  file_path: "/music/song.flac",
  file_name: "song.flac",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
};

vi.mock("../../../contexts/PlaybackContext", () => ({
  usePlayback: () => ({
    state: {
      currentTrack: mockTrack,
      isPlaying: true,
      volume: 0.8,
      queue: [],
      queueIndex: 0,
      shuffle: false,
      repeat: "off",
    },
    pause: vi.fn(),
    resume: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
  }),
  usePlaybackTime: () => ({ currentTime: 30, duration: 200 }),
}));

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("CoverFlowLyrics", () => {
  it("renders nothing when no synced lyrics available", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: "Plain lyrics only",
      synced_lyrics: null,
      source: "database",
    });

    const { container } = render(<CoverFlowLyrics />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_lyrics", { trackId: 1 });
    });

    // Should render nothing — overlay only supports synced lyrics
    expect(container.firstChild).toBeNull();
  });

  it("renders synced lyrics lines", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: null,
      synced_lyrics: "[00:05.00] First line\n[00:30.00] Active line\n[01:00.00] Third line",
      source: "database",
    });

    render(<CoverFlowLyrics />);

    await waitFor(() => {
      expect(screen.getByText("First line")).toBeInTheDocument();
      expect(screen.getByText("Active line")).toBeInTheDocument();
      expect(screen.getByText("Third line")).toBeInTheDocument();
    });
  });

  it("highlights the active line based on playback time", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: null,
      synced_lyrics: "[00:05.00] First line\n[00:30.00] Active line\n[01:00.00] Third line",
      source: "database",
    });

    render(<CoverFlowLyrics />);

    await waitFor(() => {
      const activeLine = screen.getByText("Active line");
      // currentTime is 30s, so "Active line" at 30s should be active (white, semibold)
      expect(activeLine.className).toContain("text-white");
      expect(activeLine.className).toContain("font-semibold");
    });
  });

  it("has semi-transparent backdrop for artwork visibility", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: null,
      synced_lyrics: "[00:05.00] Line one\n[00:30.00] Line two",
      source: "database",
    });

    render(<CoverFlowLyrics />);

    await waitFor(() => {
      expect(screen.getByText("Line one")).toBeInTheDocument();
    });

    // The overlay container should have the semi-transparent background class
    const overlay = screen.getByText("Line one").closest("[class*='bg-black']");
    expect(overlay).toBeTruthy();
    expect(overlay!.className).toContain("backdrop-blur");
  });
});
