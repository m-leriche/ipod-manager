import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NowPlayingBar } from "./NowPlayingBar";
import type { LibraryTrack } from "../../../types/library";

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
  flagged: false,
};

// Controllable mock state
let mockPlaybackState = {
  currentTrack: null as LibraryTrack | null,
  isPlaying: false,
  volume: 0.8,
  queue: [] as LibraryTrack[],
  queueIndex: -1,
  shuffle: false,
  repeat: "off" as "off" | "all" | "one",
};

vi.mock("../../../contexts/PlaybackContext", () => ({
  usePlayback: () => ({
    state: mockPlaybackState,
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
  }),
  usePlaybackTime: () => ({ currentTime: 0, duration: 0 }),
}));

describe("NowPlayingBar", () => {
  it("renders nothing when no track is playing", () => {
    mockPlaybackState = { ...mockPlaybackState, currentTrack: null };
    const { container } = render(<NowPlayingBar />);
    expect(container.firstChild).toBeNull();
  });

  it("renders bar when a track is playing", () => {
    mockPlaybackState = { ...mockPlaybackState, currentTrack: track, isPlaying: true };
    render(<NowPlayingBar />);
    expect(screen.getByText("Test Song")).toBeInTheDocument();
    expect(screen.getByText("Test Artist")).toBeInTheDocument();
  });

  it("shows Play button when not playing", () => {
    mockPlaybackState = { ...mockPlaybackState, currentTrack: track, isPlaying: false };
    render(<NowPlayingBar />);
    expect(screen.getByTitle("Play")).toBeInTheDocument();
  });

  it("shows Pause button when playing", () => {
    mockPlaybackState = { ...mockPlaybackState, currentTrack: track, isPlaying: true };
    render(<NowPlayingBar />);
    expect(screen.getByTitle("Pause")).toBeInTheDocument();
  });

  it("shows transport and volume controls", () => {
    mockPlaybackState = { ...mockPlaybackState, currentTrack: track };
    render(<NowPlayingBar />);
    expect(screen.getByTitle("Previous")).toBeInTheDocument();
    expect(screen.getByTitle("Next")).toBeInTheDocument();
    expect(screen.getByTitle("Shuffle")).toBeInTheDocument();
    expect(screen.getByTitle("Mute")).toBeInTheDocument();
  });
});
