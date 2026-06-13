import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { GenreMapView } from "./GenreMapView";
import type { LibraryTrack } from "../../../types/library";

beforeEach(() => {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const track = (id: number, genre: string | null): LibraryTrack => ({
  id,
  file_path: `/music/${id}.flac`,
  file_name: `${id}.flac`,
  folder_path: "/music",
  title: `Track ${id}`,
  artist: "Artist",
  album: "Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: null,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: null,
  genre,
  duration_secs: 180,
  sample_rate: 44100,
  bitrate_kbps: 1000,
  format: "FLAC",
  file_size: 1000,
  created_at: 0,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  compilation: false,
  replay_gain_track_db: null,
  replay_gain_album_db: null,
});

describe("GenreMapView", () => {
  it("shows a loading state while fetching", () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));
    render(<GenreMapView />);
    expect(screen.getByText("Loading library...")).toBeInTheDocument();
  });

  it("shows an empty state when the library has no tracks", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    render(<GenreMapView />);
    expect(await screen.findByText("No tracks in your library yet.")).toBeInTheDocument();
  });

  it("shows an error state with retry when loading fails", async () => {
    vi.mocked(invoke).mockRejectedValue("db locked");
    render(<GenreMapView />);
    expect(await screen.findByText(/Failed to load library: db locked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders the map with track and genre counts", async () => {
    vi.mocked(invoke).mockResolvedValue([track(1, "Rock"), track(2, "Rock"), track(3, "Jazz")]);
    render(<GenreMapView />);

    expect(await screen.findByRole("img", { name: "Genre map of library tracks" })).toBeInTheDocument();
    expect(screen.getByText(/3 tracks · 2 genres/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_library_tracks", { filter: { limit: 500000 } });
  });
});
