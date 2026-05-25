import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LyricsPanel } from "./LyricsPanel";
import type { LibraryTrack } from "../../../types/library";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../../../contexts/PlaybackContext", () => ({
  usePlayback: () => ({
    state: {
      currentTrack: null,
      isPlaying: false,
      volume: 0.8,
      queue: [],
      queueIndex: -1,
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

const track: LibraryTrack = {
  id: 1,
  file_path: "/music/song.flac",
  file_name: "song.flac",
  folder_path: "/music",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  genre: null,
  track_number: 1,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: null,
  duration_secs: 200,
  sample_rate: null,
  bitrate_kbps: null,
  format: "flac",
  file_size: 10000,
  created_at: 1704067200,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("LyricsPanel", () => {
  it("shows 'No lyrics available' when database returns no lyrics", async () => {
    mockInvoke.mockRejectedValue("not found");
    render(<LyricsPanel track={track} />);

    await waitFor(() => {
      expect(screen.getByText("No lyrics available")).toBeInTheDocument();
    });
  });

  it("shows Search Online button when no lyrics", async () => {
    mockInvoke.mockRejectedValue("not found");
    render(<LyricsPanel track={track} />);

    await waitFor(() => {
      expect(screen.getByText("Search Online")).toBeInTheDocument();
    });
  });

  it("displays plain lyrics from database", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: "Hello world\nSecond line",
      synced_lyrics: null,
      source: "database",
    });

    render(<LyricsPanel track={track} />);

    await waitFor(() => {
      expect(
        screen.getByText((_, el) => el?.tagName === "PRE" && el.textContent === "Hello world\nSecond line"),
      ).toBeInTheDocument();
    });
  });

  it("displays synced lyrics lines individually", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: null,
      synced_lyrics: "[00:05.00] First line\n[00:30.00] Active line\n[01:00.00] Third line",
      source: "database",
    });

    render(<LyricsPanel track={track} />);

    await waitFor(() => {
      expect(screen.getByText("First line")).toBeInTheDocument();
      expect(screen.getByText("Active line")).toBeInTheDocument();
      expect(screen.getByText("Third line")).toBeInTheDocument();
    });
  });

  it("fetches lyrics when Search Online is clicked", async () => {
    const user = userEvent.setup();

    // First call: get_lyrics returns nothing
    mockInvoke.mockRejectedValueOnce("not found");
    // Second call: fetch_lyrics returns results
    mockInvoke.mockResolvedValueOnce({
      track_id: 1,
      lyrics: "Fetched lyrics here",
      synced_lyrics: null,
      source: "lrclib",
    });

    render(<LyricsPanel track={track} />);

    await waitFor(() => {
      expect(screen.getByText("Search Online")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Search Online"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "fetch_lyrics",
        expect.objectContaining({
          trackId: 1,
          artist: "Test Artist",
          title: "Test Song",
        }),
      );
    });
  });

  it("shows Lyrics header in panel variant", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: "Some lyrics",
      synced_lyrics: null,
      source: "database",
    });

    render(<LyricsPanel track={track} variant="panel" />);

    await waitFor(() => {
      expect(screen.getByText("Lyrics")).toBeInTheDocument();
    });
  });

  it("does not show header in overlay variant", async () => {
    mockInvoke.mockResolvedValue({
      track_id: 1,
      lyrics: "Some lyrics",
      synced_lyrics: null,
      source: "database",
    });

    render(<LyricsPanel track={track} variant="overlay" />);

    await waitFor(() => {
      expect(screen.getByText("Some lyrics")).toBeInTheDocument();
      expect(screen.queryByText("Lyrics")).not.toBeInTheDocument();
    });
  });
});
