import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TrackRow } from "./TrackRow";
import type { LibraryTrack } from "../../../types/library";

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 1,
  file_path: "/music/test.flac",
  file_name: "test.flac",
  folder_path: "/music",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: 2023,
  genre: "Rock",
  duration_secs: 215,
  sample_rate: 44100,
  bitrate_kbps: 320,
  format: "FLAC",
  file_size: 30000000,
  created_at: Date.now(),
  play_count: 5,
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
  ...overrides,
});

const renderRow = (props: Partial<Parameters<typeof TrackRow>[0]> = {}) => {
  const defaultProps = {
    track: makeTrack(),
    index: 0,
    isPlaying: false,
    isSelected: false,
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
    onContextMenu: vi.fn(),
    ...props,
  };

  return render(
    <table>
      <tbody>
        <TrackRow {...defaultProps} />
      </tbody>
    </table>,
  );
};

describe("TrackRow", () => {
  it("renders track metadata", () => {
    renderRow();
    expect(screen.getByText("Test Song")).toBeInTheDocument();
    expect(screen.getByText("Test Artist")).toBeInTheDocument();
    expect(screen.getByText("Test Album")).toBeInTheDocument();
    expect(screen.getByText("3:35")).toBeInTheDocument();
  });

  it("shows file_name when title is null", () => {
    renderRow({ track: makeTrack({ title: null }) });
    expect(screen.getByText("test.flac")).toBeInTheDocument();
  });

  it("shows em dash for missing artist and album", () => {
    renderRow({ track: makeTrack({ artist: null, album: null }) });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("shows em dash for invalid duration", () => {
    renderRow({ track: makeTrack({ duration_secs: -1 }) });
    // The duration cell should show "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 1-based index when not playing", () => {
    renderRow({ index: 4 });
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows equalizer bars when playing", () => {
    const { container } = renderRow({ isPlaying: true });
    const bars = container.querySelectorAll("[class*='animate-equalizer']");
    expect(bars).toHaveLength(3);
  });

  it("highlights title text when playing", () => {
    renderRow({ isPlaying: true });
    const title = screen.getByText("Test Song");
    expect(title.className).toContain("text-accent");
  });

  it("fires click handler", async () => {
    const onClick = vi.fn();
    renderRow({ onClick });
    await userEvent.click(screen.getByText("Test Song"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires double-click handler", async () => {
    const onDoubleClick = vi.fn();
    renderRow({ onDoubleClick });
    await userEvent.dblClick(screen.getByText("Test Song"));
    expect(onDoubleClick).toHaveBeenCalled();
  });

  it("fires context menu handler", async () => {
    const onContextMenu = vi.fn();
    renderRow({ onContextMenu });
    const row = screen.getByText("Test Song").closest("tr")!;
    await userEvent.pointer({ keys: "[MouseRight]", target: row });
    expect(onContextMenu).toHaveBeenCalled();
  });

  it("formats zero duration as 0:00", () => {
    renderRow({ track: makeTrack({ duration_secs: 0 }) });
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});
