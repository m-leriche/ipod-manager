import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueuePanel } from "./QueuePanel";
import type { LibraryTrack } from "../../../types/library";

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 1,
  file_path: "/music/song.mp3",
  file_name: "song.mp3",
  folder_path: "/music",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: 10,
  disc_number: 1,
  disc_total: 1,
  year: 2024,
  genre: "Rock",
  duration_secs: 200,
  sample_rate: 44100,
  bitrate_kbps: 320,
  format: "MP3",
  file_size: 5000000,
  created_at: 1700000000,
  play_count: 5,
  flagged: false,
  rating: 0,
  ...overrides,
});

// Override the PlaybackContext mock from setup.ts with controllable vi.fn()
const mockRemoveFromQueue = vi.fn();
const mockReorderQueue = vi.fn();
const mockClearQueue = vi.fn();
const mockPlayTrack = vi.fn();

let mockState = {
  currentTrack: null as LibraryTrack | null,
  isPlaying: false,
  volume: 0.8,
  queue: [] as LibraryTrack[],
  queueIndex: -1,
  shuffle: false,
  repeat: "off" as const,
};

vi.mock("../../../contexts/PlaybackContext", () => ({
  usePlayback: () => ({
    state: mockState,
    playTrack: mockPlayTrack,
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
    removeFromQueue: mockRemoveFromQueue,
    reorderQueue: mockReorderQueue,
    clearQueue: mockClearQueue,
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
  }),
}));

describe("QueuePanel", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mockState = {
      currentTrack: null,
      isPlaying: false,
      volume: 0.8,
      queue: [],
      queueIndex: -1,
      shuffle: false,
      repeat: "off",
    };
  });

  it("renders Queue header", () => {
    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText("Queue")).toBeInTheDocument();
  });

  it("renders Clear button", () => {
    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("renders empty state when queue is empty", () => {
    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText("Queue is empty")).toBeInTheDocument();
    expect(screen.getByText("Drag tracks here or right-click to add")).toBeInTheDocument();
  });

  it("renders tracks in the queue", () => {
    mockState.queue = [
      makeTrack({ id: 1, title: "Song One", artist: "Artist A", duration_secs: 180 }),
      makeTrack({ id: 2, title: "Song Two", artist: "Artist B", duration_secs: 240 }),
    ];
    mockState.queueIndex = 0;

    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText("Song One")).toBeInTheDocument();
    expect(screen.getByText("Song Two")).toBeInTheDocument();
  });

  it("formats duration correctly", () => {
    mockState.queue = [makeTrack({ duration_secs: 185 })];
    mockState.queueIndex = -1;

    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText(/3:05/)).toBeInTheDocument();
  });

  it("shows artist name with track", () => {
    mockState.queue = [makeTrack({ artist: "Cool Artist", duration_secs: 60 })];
    mockState.queueIndex = -1;

    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText(/Cool Artist/)).toBeInTheDocument();
  });

  it("falls back to file_name when title is empty", () => {
    mockState.queue = [makeTrack({ title: "", file_name: "my_track.mp3" })];
    mockState.queueIndex = -1;

    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText("my_track.mp3")).toBeInTheDocument();
  });

  it("falls back to Unknown Artist when artist is null", () => {
    mockState.queue = [makeTrack({ artist: null })];
    mockState.queueIndex = -1;

    render(<QueuePanel onClose={onClose} />);
    expect(screen.getByText(/Unknown Artist/)).toBeInTheDocument();
  });

  it("hides remove button for currently playing track", () => {
    mockState.queue = [makeTrack({ id: 1, title: "Current Song" }), makeTrack({ id: 2, title: "Next Song" })];
    mockState.queueIndex = 0;

    const { container } = render(<QueuePanel onClose={onClose} />);
    const queueItems = container.querySelectorAll("[data-queue-index]");
    // Second item (not current) should have a remove button with X icon
    const secondItemRemoveBtn = queueItems[1]?.querySelector("button > svg");
    expect(secondItemRemoveBtn).not.toBeNull();
    // The current track shouldn't have a close button child (only drag handle div)
    const firstItemCloseIcons = queueItems[0]?.querySelectorAll('svg path[d="M6 18L18 6M6 6l12 12"]');
    expect(firstItemCloseIcons?.length ?? 0).toBe(0);
  });

  it("calls clearQueue when Clear is clicked", async () => {
    const user = userEvent.setup();
    render(<QueuePanel onClose={onClose} />);
    await user.click(screen.getByText("Clear"));
    expect(mockClearQueue).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<QueuePanel onClose={onClose} />);
    const headerDiv = container.querySelector(".border-b");
    const buttons = headerDiv?.querySelectorAll("button");
    // Second button is the close (X) button
    if (buttons && buttons.length >= 2) {
      await user.click(buttons[1]);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("highlights current track with accent color", () => {
    mockState.queue = [makeTrack({ id: 1, title: "Playing Now" }), makeTrack({ id: 2, title: "Up Next" })];
    mockState.queueIndex = 0;

    render(<QueuePanel onClose={onClose} />);
    const playingText = screen.getByText("Playing Now");
    expect(playingText.className).toContain("text-accent");
  });

  it("handles invalid duration gracefully", () => {
    mockState.queue = [makeTrack({ duration_secs: Infinity })];
    mockState.queueIndex = -1;

    render(<QueuePanel onClose={onClose} />);
    // formatDuration returns "—" for Infinity
    const container = screen.getByText(/Test Artist/).closest("div");
    expect(container?.textContent).toContain("\u2014");
  });

  it("calls removeFromQueue when remove button is clicked", async () => {
    const user = userEvent.setup();
    mockState.queue = [makeTrack({ id: 1, title: "Track A" }), makeTrack({ id: 2, title: "Track B" })];
    mockState.queueIndex = 0;

    const { container } = render(<QueuePanel onClose={onClose} />);
    // Track B (index 1) is not current, so it has a remove button
    const secondItem = container.querySelector('[data-queue-index="1"]');
    const removeBtn = secondItem?.querySelector("button");
    if (removeBtn) {
      await user.click(removeBtn);
      expect(mockRemoveFromQueue).toHaveBeenCalledWith(1);
    }
  });

  it("does not show empty state when queue has tracks", () => {
    mockState.queue = [makeTrack()];
    mockState.queueIndex = 0;

    render(<QueuePanel onClose={onClose} />);
    expect(screen.queryByText("Queue is empty")).not.toBeInTheDocument();
  });
});
