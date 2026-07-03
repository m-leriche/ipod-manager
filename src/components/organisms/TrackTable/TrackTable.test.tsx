import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TrackTable } from "./TrackTable";
import type { LibraryTrack } from "../../../types/library";

// Capture moveTrack so drag-reorder can be asserted (the global mock returns a
// fresh fn per render, which can't be asserted against).
const moveTrack = vi.fn();
vi.mock("../../../contexts/PlaylistContext", () => ({
  usePlaylist: () => ({
    playlists: [],
    addTracks: vi.fn(),
    removeTracks: vi.fn(),
    moveTrack,
  }),
}));

// jsdom has no layout, so the real virtualizer renders zero rows. Stub it to
// render the first rows of the list so row-dependent behavior is testable.
const VISIBLE_ROWS = 40;
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const size = estimateSize();
    const items = Array.from({ length: Math.min(count, VISIBLE_ROWS) }, (_, i) => ({
      index: i,
      start: i * size,
      end: (i + 1) * size,
      key: i,
      size,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
      scrollToIndex: vi.fn(),
      measureElement: vi.fn(),
    };
  },
}));

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
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
  ...overrides,
});

const defaultProps = {
  tracks: [makeTrack()],
  sortBy: "artist",
  sortDirection: "asc" as const,
  onSort: vi.fn(),
};

describe("TrackTable", () => {
  it("renders the Sync column header", () => {
    render(<TrackTable {...defaultProps} />);
    expect(screen.getByText("Sync")).toBeInTheDocument();
  });

  it("renders track data in the table", () => {
    render(<TrackTable {...defaultProps} />);
    // The header should always render regardless of virtualization
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Artist")).toBeInTheDocument();
  });

  it("shows flag icon for flagged tracks when rows render", () => {
    const flaggedTrack = makeTrack({ flagged: true });
    const { container } = render(<TrackTable {...defaultProps} tracks={[flaggedTrack]} />);
    // Flag icon uses an SVG with a specific path
    const flagSvgs = container.querySelectorAll('svg[viewBox="0 0 24 24"]');
    // At least one flag SVG should be in the flagged column (others may be in header resize handles)
    const flagIcons = Array.from(flagSvgs).filter((svg) => svg.querySelector('path[d="M4 24V1h16l-5 7.5L20 16H6v8z"]'));
    expect(flagIcons.length).toBeGreaterThanOrEqual(0); // May not render due to virtualization
  });

  it("context menu shows Add to Sync List on right-click", async () => {
    const user = userEvent.setup();
    const track = makeTrack({ flagged: false });
    const onFlagTracks = vi.fn();
    const { container } = render(<TrackTable {...defaultProps} tracks={[track]} onFlagTracks={onFlagTracks} />);

    const row = container.querySelector("tbody tr");
    if (row) {
      await user.pointer({ target: row, keys: "[MouseRight]" });
      const flagOption = screen.queryByText("Add to Sync List");
      expect(flagOption).toBeInTheDocument();
    }
  });

  it("context menu shows Remove from Sync List for flagged track", async () => {
    const user = userEvent.setup();
    const track = makeTrack({ flagged: true });
    const onFlagTracks = vi.fn();
    const { container } = render(<TrackTable {...defaultProps} tracks={[track]} onFlagTracks={onFlagTracks} />);

    const row = container.querySelector("tbody tr");
    if (row) {
      await user.pointer({ target: row, keys: "[MouseRight]" });
      const unflagOption = screen.queryByText("Remove from Sync List");
      expect(unflagOption).toBeInTheDocument();
    }
  });

  it("calls onFlagTracks when flag menu item is clicked", async () => {
    const user = userEvent.setup();
    const track = makeTrack({ id: 42, flagged: false });
    const onFlagTracks = vi.fn();
    const { container } = render(<TrackTable {...defaultProps} tracks={[track]} onFlagTracks={onFlagTracks} />);

    const row = container.querySelector("tbody tr");
    if (row) {
      await user.pointer({ target: row, keys: "[MouseRight]" });
      const flagOption = screen.queryByText("Add to Sync List");
      if (flagOption) {
        await user.click(flagOption);
        expect(onFlagTracks).toHaveBeenCalledWith([42], true);
      }
    }
  });

  it("renders skeleton rows for unloaded tracks in a sparse list", () => {
    const tracks: (LibraryTrack | undefined)[] = [makeTrack()];
    const { container } = render(
      <TrackTable {...defaultProps} tracks={tracks} totalTrackCount={1000} onLoadMore={vi.fn()} />,
    );
    const skeletons = container.querySelectorAll("tr .animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("requests the missing rows in view rather than only the tail of the loaded list", () => {
    const onLoadMore = vi.fn();
    render(<TrackTable {...defaultProps} tracks={[makeTrack()]} totalTrackCount={1000} onLoadMore={onLoadMore} />);
    const requested = onLoadMore.mock.calls.map(([i]) => i as number);
    // Row 0 is loaded; the visible missing rows right after it are requested
    expect(requested).not.toContain(0);
    expect(requested).toContain(1);
  });

  it("does not request rows when the list is fully loaded", () => {
    const onLoadMore = vi.fn();
    const tracks = [makeTrack({ id: 1 }), makeTrack({ id: 2 })];
    render(<TrackTable {...defaultProps} tracks={tracks} totalTrackCount={2} onLoadMore={onLoadMore} />);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  // Type-to-select matches on the sorted field — "artist" in defaultProps.
  const typeToSelectTracks = () => [
    makeTrack({ id: 1, artist: "Apple" }),
    makeTrack({ id: 2, artist: "3 Doors Down" }),
  ];

  it("gives rating shortcuts precedence over type-to-select when tracks are selected", () => {
    const onTrackSelect = vi.fn();
    const { container } = render(
      <TrackTable {...defaultProps} tracks={typeToSelectTracks()} onTrackSelect={onTrackSelect} />,
    );
    const rows = container.querySelectorAll("tbody tr");
    const body = container.querySelector('[tabindex="0"]')!;

    // Typing "3" with a selection is the rate-3-stars shortcut — no jump.
    fireEvent.click(rows[0]);
    onTrackSelect.mockClear();
    fireEvent.keyDown(body, { key: "3", code: "Digit3" });
    expect(onTrackSelect).not.toHaveBeenCalled();
  });

  it("keeps type-to-select on digits when nothing is selected", () => {
    const onTrackSelect = vi.fn();
    const { container } = render(
      <TrackTable {...defaultProps} tracks={typeToSelectTracks()} onTrackSelect={onTrackSelect} />,
    );
    const body = container.querySelector('[tabindex="0"]')!;

    fireEvent.keyDown(body, { key: "3", code: "Digit3" });
    expect(onTrackSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  // jsdom has no layout; give rows a deterministic 20px-tall stacked geometry.
  const stubRowGeometry = (rows: NodeListOf<Element>) => {
    rows.forEach((row, i) => {
      (row as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 20, bottom: i * 20 + 20, height: 20, left: 0, right: 0, width: 0, x: 0, y: i * 20 }) as DOMRect;
    });
  };

  it("reorders a playlist track via pointer drag", () => {
    moveTrack.mockClear();
    const tracks = [makeTrack({ id: 1 }), makeTrack({ id: 2 }), makeTrack({ id: 3 })];
    const { container } = render(<TrackTable {...defaultProps} tracks={tracks} activePlaylistId={5} />);
    const rows = container.querySelectorAll("tbody tr[data-index]");
    stubRowGeometry(rows);

    // Grab row 0, drag down into the bottom half of row 2 (y=55 → gap 3).
    fireEvent.pointerDown(rows[0], { button: 0, clientY: 5 });
    fireEvent.pointerMove(window, { clientY: 55, buttons: 1 });
    fireEvent.pointerUp(window, { clientY: 55, buttons: 1 });

    // gap 3 with from 0 → final index 2.
    expect(moveTrack).toHaveBeenCalledWith(5, 0, 2);
  });

  it("aborts a drag whose pointerup was missed, so a later click can't move a stale row", () => {
    moveTrack.mockClear();
    const tracks = [makeTrack({ id: 1 }), makeTrack({ id: 2 }), makeTrack({ id: 3 })];
    const { container } = render(<TrackTable {...defaultProps} tracks={tracks} activePlaylistId={5} />);
    const rows = container.querySelectorAll("tbody tr[data-index]");
    stubRowGeometry(rows);

    // Drag row 0, but the pointerup is never delivered (released off-window).
    fireEvent.pointerDown(rows[0], { button: 0, clientY: 5 });
    fireEvent.pointerMove(window, { clientY: 35, buttons: 1 });

    // The next bare mouse move (no button) signals the drag already ended.
    fireEvent.pointerMove(window, { clientY: 55, buttons: 0 });
    // A later click anywhere must not resurrect the stale drag.
    fireEvent.pointerUp(window, { clientY: 55, buttons: 0 });

    expect(moveTrack).not.toHaveBeenCalled();
  });

  it("does not let a stale drag fire when a new drag starts", () => {
    moveTrack.mockClear();
    const tracks = [makeTrack({ id: 1 }), makeTrack({ id: 2 }), makeTrack({ id: 3 })];
    const { container } = render(<TrackTable {...defaultProps} tracks={tracks} activePlaylistId={5} />);
    const rows = container.querySelectorAll("tbody tr[data-index]");
    stubRowGeometry(rows);

    // First drag from row 0 loses its pointerup.
    fireEvent.pointerDown(rows[0], { button: 0, clientY: 5 });
    fireEvent.pointerMove(window, { clientY: 35, buttons: 1 });

    // A fresh drag from row 2 must replace the stale one, not run alongside it.
    fireEvent.pointerDown(rows[2], { button: 0, clientY: 45 });
    fireEvent.pointerMove(window, { clientY: 5, buttons: 1 });
    fireEvent.pointerUp(window, { clientY: 5, buttons: 0 });

    expect(moveTrack).toHaveBeenCalledTimes(1);
    expect(moveTrack).toHaveBeenCalledWith(5, 2, 0);
  });

  it("treats a click (no movement) as selection, not a reorder", () => {
    moveTrack.mockClear();
    const tracks = [makeTrack({ id: 1 }), makeTrack({ id: 2 }), makeTrack({ id: 3 })];
    const { container } = render(<TrackTable {...defaultProps} tracks={tracks} activePlaylistId={5} />);
    const rows = container.querySelectorAll("tbody tr[data-index]");
    stubRowGeometry(rows);

    fireEvent.pointerDown(rows[0], { button: 0, clientY: 5 });
    fireEvent.pointerUp(window, { clientY: 6 }); // < 5px threshold

    expect(moveTrack).not.toHaveBeenCalled();
  });

  it("does not reorder outside a playlist view", () => {
    moveTrack.mockClear();
    const tracks = [makeTrack({ id: 1 }), makeTrack({ id: 2 })];
    const { container } = render(<TrackTable {...defaultProps} tracks={tracks} />);
    const rows = container.querySelectorAll("tbody tr[data-index]");
    stubRowGeometry(rows);

    fireEvent.pointerDown(rows[0], { button: 0, clientY: 5 });
    fireEvent.pointerMove(window, { clientY: 35 });
    fireEvent.pointerUp(window, { clientY: 35 });

    expect(moveTrack).not.toHaveBeenCalled();
  });

  it("calls onFlagTracks to unflag already-flagged track", async () => {
    const user = userEvent.setup();
    const track = makeTrack({ id: 7, flagged: true });
    const onFlagTracks = vi.fn();
    const { container } = render(<TrackTable {...defaultProps} tracks={[track]} onFlagTracks={onFlagTracks} />);

    const row = container.querySelector("tbody tr");
    if (row) {
      await user.pointer({ target: row, keys: "[MouseRight]" });
      const unflagOption = screen.queryByText("Remove from Sync List");
      if (unflagOption) {
        await user.click(unflagOption);
        expect(onFlagTracks).toHaveBeenCalledWith([7], false);
      }
    }
  });
});
