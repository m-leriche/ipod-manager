import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { LibraryStats } from "./LibraryStats";
import {
  formatBytes,
  formatDuration,
  formatTrackDuration,
  formatBitrate,
  formatPercentage,
  sortPlayData,
} from "./helpers";
import type { LibraryStats as LibraryStatsData, RockboxTrack } from "../../../types/libstats";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const MOCK_STATS: LibraryStatsData = {
  total_tracks: 1500,
  total_size: 50_000_000_000,
  total_duration_secs: 360000,
  average_bitrate_kbps: 900,
  artist_count: 120,
  album_count: 250,
  format_breakdown: [
    { format: "FLAC", count: 1000, size: 40_000_000_000, percentage: 66.7 },
    { format: "MP3", count: 500, size: 10_000_000_000, percentage: 33.3 },
  ],
  genre_distribution: [
    { label: "Rock", count: 600 },
    { label: "Electronic", count: 400 },
  ],
  sample_rate_distribution: [{ label: "44.1 kHz", count: 1400 }],
  year_distribution: [
    { year: 2020, count: 100 },
    { year: 2021, count: 200 },
  ],
  oldest_year: 2020,
  newest_year: 2021,
};

const MOCK_TRACKS: RockboxTrack[] = [
  {
    title: "Song A",
    artist: "Artist 1",
    album: "Album 1",
    filename: "/music/a.mp3",
    genre: "Rock",
    year: 2020,
    track_number: 1,
    bitrate: 320,
    length_ms: 240000,
    playcount: 50,
    rating: 8,
    playtime_ms: 12000000,
    lastplayed: 100,
    lastplayed_rank: 1,
  },
  {
    title: "Song B",
    artist: "Artist 2",
    album: "Album 2",
    filename: "/music/b.flac",
    genre: "Jazz",
    year: 2019,
    track_number: 2,
    bitrate: 900,
    length_ms: 300000,
    playcount: 0,
    rating: 0,
    playtime_ms: 0,
    lastplayed: 0,
    lastplayed_rank: 2,
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
});

describe("LibraryStats", () => {
  it("shows idle state with choose folder button", () => {
    render(<LibraryStats />);
    expect(screen.getByText("Choose Folder")).toBeInTheDocument();
    expect(screen.getByText(/scan a music library/i)).toBeInTheDocument();
  });

  it("switches to rockbox mode", async () => {
    const user = userEvent.setup();
    render(<LibraryStats />);

    await user.click(screen.getByText("iPod Play Data"));
    expect(screen.getByText("Detect iPod")).toBeInTheDocument();
  });

  it("triggers scan after folder selection", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music/library");
    mockInvoke.mockResolvedValue(MOCK_STATS);

    render(<LibraryStats />);
    await user.click(screen.getByText("Choose Folder"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("scan_library_stats", { path: "/music/library" });
    });
  });

  it("displays stats after successful scan", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music/library");
    mockInvoke.mockResolvedValue(MOCK_STATS);

    render(<LibraryStats />);
    await user.click(screen.getByText("Choose Folder"));

    await waitFor(() => {
      expect(screen.getByText("1,500")).toBeInTheDocument();
    });
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("FLAC")).toBeInTheDocument();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });

  it("shows error on scan failure", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/bad/path");
    mockInvoke.mockRejectedValue("Path does not exist");

    render(<LibraryStats />);
    await user.click(screen.getByText("Choose Folder"));

    await waitFor(() => {
      expect(screen.getByText("Path does not exist")).toBeInTheDocument();
    });
  });

  it("loads rockbox play data on detect", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      total_tracks: 2,
      tracks: MOCK_TRACKS,
      max_serial: 100,
      rating_distribution: [{ rating: 8, count: 1 }],
    });

    render(<LibraryStats />);
    await user.click(screen.getByText("iPod Play Data"));
    await user.click(screen.getByText("Detect iPod"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("read_rockbox_playdata", {
        ipodPath: "/Volumes/IPOD",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Song A")).toBeInTheDocument();
    });
  });

  it("shows rockbox error when database not found", async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue("Rockbox database not found");

    render(<LibraryStats />);
    await user.click(screen.getByText("iPod Play Data"));
    await user.click(screen.getByText("Detect iPod"));

    await waitFor(() => {
      expect(screen.getByText("Rockbox database not found")).toBeInTheDocument();
    });
  });

  it("does not scan when folder picker is cancelled", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue(null);

    render(<LibraryStats />);
    await user.click(screen.getByText("Choose Folder"));

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  describe("formatBytes", () => {
    it("formats bytes", () => expect(formatBytes(500)).toBe("500 B"));
    it("formats KB", () => expect(formatBytes(1536)).toBe("1.5 KB"));
    it("formats MB", () => expect(formatBytes(5_242_880)).toBe("5.0 MB"));
    it("formats GB", () => expect(formatBytes(2_147_483_648)).toBe("2.00 GB"));
  });

  describe("formatDuration", () => {
    it("formats minutes only", () => expect(formatDuration(300)).toBe("5m"));
    it("formats hours and minutes", () => expect(formatDuration(7200)).toBe("2h 0m"));
    it("formats days", () => expect(formatDuration(100000)).toBe("1d 3h 46m"));
  });

  describe("formatTrackDuration", () => {
    it("formats ms to mm:ss", () => expect(formatTrackDuration(240000)).toBe("4:00"));
    it("pads seconds", () => expect(formatTrackDuration(65000)).toBe("1:05"));
  });

  describe("formatBitrate", () => {
    it("formats kbps", () => expect(formatBitrate(320)).toBe("320 kbps"));
  });

  describe("formatPercentage", () => {
    it("formats with one decimal", () => expect(formatPercentage(66.667)).toBe("66.7%"));
  });

  describe("sortPlayData", () => {
    it("most_played sorts by playcount descending", () => {
      const sorted = sortPlayData(MOCK_TRACKS, "most_played");
      expect(sorted).toHaveLength(1);
      expect(sorted[0].title).toBe("Song A");
    });

    it("never_played filters to unplayed tracks", () => {
      const sorted = sortPlayData(MOCK_TRACKS, "never_played");
      expect(sorted).toHaveLength(1);
      expect(sorted[0].title).toBe("Song B");
    });

    it("highest_rated filters to rated tracks", () => {
      const sorted = sortPlayData(MOCK_TRACKS, "highest_rated");
      expect(sorted).toHaveLength(1);
      expect(sorted[0].rating).toBe(8);
    });

    it("least_recent sorts by lastplayed_rank descending", () => {
      const sorted = sortPlayData(MOCK_TRACKS, "least_recent");
      expect(sorted).toHaveLength(1); // only played tracks
      expect(sorted[0].title).toBe("Song A");
    });
  });
});
