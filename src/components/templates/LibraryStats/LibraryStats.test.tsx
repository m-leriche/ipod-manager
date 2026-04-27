import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LibraryStats } from "./LibraryStats";
import {
  formatBytes,
  formatDuration,
  formatTrackDuration,
  formatBitrate,
  formatPercentage,
  sortPlayData,
  filterFileDetails,
  sortFileDetails,
} from "./helpers";
import type { LibraryStats as LibraryStatsData, RockboxTrack, FileDetail } from "../../../types/libstats";

const mockInvoke = vi.mocked(invoke);

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
  file_details: [
    {
      relative_path: "Artist1/Album1/track1.flac",
      artist: "Artist1",
      album: "Album1",
      title: "Track 1",
      genre: "Rock",
      year: 2020,
      sample_rate: 44100,
      sample_rate_display: "44.1 kHz",
      bitrate_kbps: 900,
      duration_secs: 240,
      size: 30_000_000,
      format: "FLAC",
    },
    {
      relative_path: "Artist2/Album2/track2.mp3",
      artist: "Artist2",
      album: "Album2",
      title: "Track 2",
      genre: "Electronic",
      year: 2021,
      sample_rate: 48000,
      sample_rate_display: "48 kHz",
      bitrate_kbps: 320,
      duration_secs: 180,
      size: 5_000_000,
      format: "MP3",
    },
  ],
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
});

describe("LibraryStats", () => {
  it("shows message when no library path is set", () => {
    render(<LibraryStats libraryPath={null} />);
    expect(screen.getByText(/set a library location/i)).toBeInTheDocument();
  });

  it("loads stats from DB when libraryPath is provided", async () => {
    mockInvoke.mockResolvedValue(MOCK_STATS);

    render(<LibraryStats libraryPath="/music/library" />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_library_stats");
    });
  });

  it("displays stats after successful scan", async () => {
    mockInvoke.mockResolvedValue(MOCK_STATS);

    render(<LibraryStats libraryPath="/music/library" />);

    await waitFor(() => {
      expect(screen.getByText("1,500")).toBeInTheDocument();
    });
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("FLAC")).toBeInTheDocument();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });

  it("shows error on scan failure with retry", async () => {
    mockInvoke.mockRejectedValue("Path does not exist");

    render(<LibraryStats libraryPath="/bad/path" />);

    await waitFor(() => {
      expect(screen.getByText("Path does not exist")).toBeInTheDocument();
    });
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("retries scan on retry button click", async () => {
    const user = userEvent.setup();
    // DB load fails → file scan fails → user sees Retry → file scan succeeds
    mockInvoke
      .mockRejectedValueOnce("No tracks in library") // get_library_stats
      .mockRejectedValueOnce("Path does not exist") // fallback scan_library_stats
      .mockResolvedValueOnce(MOCK_STATS); // retry scan_library_stats

    render(<LibraryStats libraryPath="/music/library" />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("1,500")).toBeInTheDocument();
    });
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
      expect(sorted).toHaveLength(1);
      expect(sorted[0].title).toBe("Song A");
    });
  });

  describe("filterFileDetails", () => {
    const files: FileDetail[] = MOCK_STATS.file_details;

    it("filters by format", () => {
      const result = filterFileDetails(files, { category: "format", value: "FLAC", displayLabel: "" });
      expect(result).toHaveLength(1);
      expect(result[0].format).toBe("FLAC");
    });

    it("filters by genre", () => {
      const result = filterFileDetails(files, { category: "genre", value: "Rock", displayLabel: "" });
      expect(result).toHaveLength(1);
      expect(result[0].genre).toBe("Rock");
    });

    it("filters by sample rate", () => {
      const result = filterFileDetails(files, { category: "sample_rate", value: "44.1 kHz", displayLabel: "" });
      expect(result).toHaveLength(1);
      expect(result[0].sample_rate_display).toBe("44.1 kHz");
    });

    it("filters by year", () => {
      const result = filterFileDetails(files, { category: "year", value: "2021", displayLabel: "" });
      expect(result).toHaveLength(1);
      expect(result[0].year).toBe(2021);
    });
  });

  describe("sortFileDetails", () => {
    const files: FileDetail[] = MOCK_STATS.file_details;

    it("sorts by path ascending", () => {
      const sorted = sortFileDetails(files, "path", "asc");
      expect(sorted[0].relative_path).toBe("Artist1/Album1/track1.flac");
    });

    it("sorts by size descending", () => {
      const sorted = sortFileDetails(files, "size", "desc");
      expect(sorted[0].size).toBe(30_000_000);
    });

    it("sorts by artist ascending", () => {
      const sorted = sortFileDetails(files, "artist", "asc");
      expect(sorted[0].artist).toBe("Artist1");
      expect(sorted[1].artist).toBe("Artist2");
    });
  });
});

describe("stats drill-down", () => {
  it("opens detail modal when format bar is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_STATS);

    render(<LibraryStats libraryPath="/music/library" />);

    await waitFor(() => {
      expect(screen.getByText("FLAC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("FLAC"));

    await waitFor(() => {
      expect(screen.getByText("FLAC — 1,000 tracks")).toBeInTheDocument();
    });
    expect(screen.getByText("Artist1/Album1/track1.flac")).toBeInTheDocument();
    expect(screen.queryByText("Artist2/Album2/track2.mp3")).not.toBeInTheDocument();
  });

  it("opens detail modal when genre tag is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_STATS);

    render(<LibraryStats libraryPath="/music/library" />);

    await waitFor(() => {
      expect(screen.getByText("Rock")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Rock"));

    await waitFor(() => {
      expect(screen.getByText("Rock — 600 tracks")).toBeInTheDocument();
    });
  });

  it("closes detail modal on backdrop click", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_STATS);

    render(<LibraryStats libraryPath="/music/library" />);

    await waitFor(() => {
      expect(screen.getByText("FLAC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("FLAC"));

    await waitFor(() => {
      expect(screen.getByText("FLAC — 1,000 tracks")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("modal-backdrop"));

    await waitFor(() => {
      expect(screen.queryByText("FLAC — 1,000 tracks")).not.toBeInTheDocument();
    });
  });
});
