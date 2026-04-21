import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackDetailPanel } from "./TrackDetailPanel";
import type { LibraryTrack } from "../../../types/library";

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
  ...overrides,
});

describe("TrackDetailPanel", () => {
  it("renders single track details", () => {
    render(<TrackDetailPanel tracks={[makeTrack()]} />);
    // Title appears in header and editable field
    expect(screen.getAllByText("Test Song")).toHaveLength(2);
    // Artist appears in header and editable field
    expect(screen.getAllByText("Test Artist").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("4:00")).toBeInTheDocument();
    expect(screen.getByText("MP3")).toBeInTheDocument();
  });

  it("renders multi-track header", () => {
    const tracks = [makeTrack(), makeTrack({ id: 2, title: "Other Song" })];
    render(<TrackDetailPanel tracks={tracks} />);
    expect(screen.getByText("Editing 2 tracks")).toBeInTheDocument();
    expect(screen.queryByText("4:00")).not.toBeInTheDocument(); // no audio info for multi
  });

  it("shows editable field values", () => {
    render(<TrackDetailPanel tracks={[makeTrack()]} />);
    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.getByText("2023")).toBeInTheDocument();
  });

  it("enters edit mode on click", () => {
    render(<TrackDetailPanel tracks={[makeTrack()]} />);
    const rockField = screen.getByText("Rock");
    fireEvent.click(rockField);
    const input = screen.getByDisplayValue("Rock");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("shows save/revert when dirty", () => {
    render(<TrackDetailPanel tracks={[makeTrack()]} />);
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
    render(<TrackDetailPanel tracks={[makeTrack()]} />);
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
    render(<TrackDetailPanel tracks={tracks} />);
    expect(screen.getAllByText("(mixed)").length).toBeGreaterThan(0);
  });

  it("calls onSave after saving", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, cancelled: false, errors: [] });

    const onSave = vi.fn();
    render(<TrackDetailPanel tracks={[makeTrack()]} onSave={onSave} />);

    // Edit a field
    fireEvent.click(screen.getByText("Rock"));
    fireEvent.change(screen.getByDisplayValue("Rock"), { target: { value: "Jazz" } });
    fireEvent.blur(screen.getByDisplayValue("Jazz"));

    // Save
    fireEvent.click(screen.getByText("Save"));

    // Wait for async invoke to complete
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
