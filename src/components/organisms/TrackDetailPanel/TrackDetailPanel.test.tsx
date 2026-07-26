import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { UndoProvider } from "../../../contexts/UndoContext";
import type { LibraryTrack, AlbumSummary } from "../../../types/library";

const renderPanel = (ui: ReactElement) => render(<UndoProvider>{ui}</UndoProvider>);

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 1,
  file_path: "/music/Artist/Album/track.mp3",
  file_name: "track.mp3",
  folder_path: "/music/Artist/Album",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: "Test Artist",
  sort_artist: null,
  sort_album_artist: null,
  track_number: 3,
  track_total: 10,
  disc_number: 1,
  disc_total: 2,
  year: 2023,
  genre: "Rock",
  duration_secs: 240,
  sample_rate: 44100,
  bitrate_kbps: 320,
  format: "MP3",
  file_size: 5000000,
  created_at: 1700000000,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
  ...overrides,
});

describe("TrackDetailPanel", () => {
  it("renders single track details", () => {
    renderPanel(<TrackDetailPanel tracks={[makeTrack()]} />);
    // Title appears in header and editable field
    expect(screen.getAllByText("Test Song")).toHaveLength(2);
    // Artist appears in header and editable field
    expect(screen.getAllByText("Test Artist").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("4:00")).toBeInTheDocument();
    expect(screen.getByText("MP3")).toBeInTheDocument();
  });

  it("renders multi-track header", () => {
    const tracks = [makeTrack(), makeTrack({ id: 2, title: "Other Song" })];
    renderPanel(<TrackDetailPanel tracks={tracks} />);
    expect(screen.getByText("Editing 2 tracks")).toBeInTheDocument();
    expect(screen.queryByText("4:00")).not.toBeInTheDocument(); // no audio info for multi
  });

  it("shows editable field values", () => {
    renderPanel(<TrackDetailPanel tracks={[makeTrack()]} />);
    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.getByText("2023")).toBeInTheDocument();
  });

  it("enters edit mode on click", () => {
    renderPanel(<TrackDetailPanel tracks={[makeTrack()]} />);
    const rockField = screen.getByText("Rock");
    fireEvent.click(rockField);
    const input = screen.getByDisplayValue("Rock");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("shows save/revert when dirty", () => {
    renderPanel(<TrackDetailPanel tracks={[makeTrack()]} />);
    // No save button initially
    expect(screen.queryByText("Save")).not.toBeInTheDocument();

    // Click to edit genre
    fireEvent.click(screen.getByText("Rock"));
    const input = screen.getByDisplayValue("Rock");
    fireEvent.change(input, { target: { value: "Pop" } });
    fireEvent.blur(input);

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Revert")).toBeInTheDocument();
  });

  it("reverts changes on revert click", () => {
    renderPanel(<TrackDetailPanel tracks={[makeTrack()]} />);
    fireEvent.click(screen.getByText("Rock"));
    const input = screen.getByDisplayValue("Rock");
    fireEvent.change(input, { target: { value: "Pop" } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByText("Revert"));
    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("shows mixed values for multi-track with different fields", () => {
    const tracks = [makeTrack({ artist: "Artist A" }), makeTrack({ id: 2, artist: "Artist B" })];
    renderPanel(<TrackDetailPanel tracks={tracks} />);
    expect(screen.getAllByText("(mixed)").length).toBeGreaterThan(0);
  });

  it("shows read-only album preview when no track is highlighted", () => {
    const album: AlbumSummary = {
      name: "Preview Album",
      artist: "Preview Artist",
      year: 1999,
      track_count: 12,
      folder_path: "/music/Preview Artist/Preview Album",
    };
    renderPanel(<TrackDetailPanel tracks={[]} previewAlbum={album} />);
    expect(screen.getByText("Preview Album")).toBeInTheDocument();
    expect(screen.getByText("Preview Artist")).toBeInTheDocument();
    expect(screen.getByText("1999")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    // Read-only: no editable Save/Revert and no "Album Art" empty placeholder label
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("shows empty placeholder when no track and no preview album", () => {
    renderPanel(<TrackDetailPanel tracks={[]} />);
    expect(screen.getByText("Album Art")).toBeInTheDocument();
  });

  // The parent patches the changed rows off the backend's `library-tracks-updated`
  // event; calling onSave here too would refetch the whole browser per save.
  it("saves without triggering a second refresh via onSave", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, cancelled: false, errors: [] });

    const onSave = vi.fn();
    renderPanel(<TrackDetailPanel tracks={[makeTrack()]} onSave={onSave} />);

    // Edit a field
    fireEvent.click(screen.getByText("Rock"));
    fireEvent.change(screen.getByDisplayValue("Rock"), { target: { value: "Jazz" } });
    fireEvent.blur(screen.getByDisplayValue("Jazz"));

    // Save
    fireEvent.click(screen.getByText("Save"));

    await vi.waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("save_metadata", expect.anything()));
    expect(onSave).not.toHaveBeenCalled();
  });

  // Undo goes back through save_metadata, so it emits the same event and must
  // not refetch either.
  it("undoing a save does not trigger a second refresh via onSave", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const undoOps = [{ file_path: "/music/Artist/Album/track.mp3", genre: "Rock" }];
    vi.mocked(invoke).mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      cancelled: false,
      errors: [],
      undo_operations: undoOps,
    });

    const onSave = vi.fn();
    renderPanel(<TrackDetailPanel tracks={[makeTrack()]} onSave={onSave} />);

    fireEvent.click(screen.getByText("Rock"));
    fireEvent.change(screen.getByDisplayValue("Rock"), { target: { value: "Jazz" } });
    fireEvent.blur(screen.getByDisplayValue("Jazz"));
    fireEvent.click(screen.getByText("Save"));

    await vi.waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("save_metadata", expect.anything()));
    vi.mocked(invoke).mockClear();

    // Cmd+Z pops the entry TrackDetailPanel pushed and runs its undo.
    fireEvent.keyDown(window, { key: "z", metaKey: true });

    await vi.waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("save_metadata", { updates: undoOps }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
