import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NowPlayingInfo } from "./NowPlayingInfo";
import type { LibraryTrack } from "../../../types/library";

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
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
  ...overrides,
});

describe("NowPlayingInfo", () => {
  it("renders track title and artist", () => {
    render(<NowPlayingInfo track={makeTrack()} />);
    expect(screen.getByText("Test Song")).toBeInTheDocument();
    expect(screen.getByText("Test Artist")).toBeInTheDocument();
  });

  it("shows file_name when title is null", () => {
    render(<NowPlayingInfo track={makeTrack({ title: null })} />);
    expect(screen.getByText("song.flac")).toBeInTheDocument();
  });

  it("shows Unknown Artist when artist is null", () => {
    render(<NowPlayingInfo track={makeTrack({ artist: null })} />);
    expect(screen.getByText("Unknown Artist")).toBeInTheDocument();
  });
});
