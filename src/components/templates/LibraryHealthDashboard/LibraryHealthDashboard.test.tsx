import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LibraryHealthDashboard } from "./LibraryHealthDashboard";
import { issuePercentage, issueSeverity, extractTitleFromFileName, extractTrackInfoFromFileName } from "./helpers";
import type { HealthReport, HealthIssue } from "./types";
import type { LibraryTrack } from "../../../types/library";

const mockInvoke = vi.mocked(invoke);

const makeMockTrack = (id: number, fileName: string, artist: string): LibraryTrack => ({
  id,
  file_path: `/music/${fileName}`,
  file_name: fileName,
  folder_path: "/music",
  title: null,
  artist,
  album: "Album A",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: id,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: 2020,
  genre: "Rock",
  duration_secs: 240,
  sample_rate: 44100,
  bitrate_kbps: 900,
  format: "FLAC",
  file_size: 30000000,
  created_at: 0,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
});

const MOCK_TRACKS: LibraryTrack[] = [makeMockTrack(1, "track_1.flac", "Artist A")];

const MOCK_TRACKS_MULTI: LibraryTrack[] = [
  makeMockTrack(1, "track_1.flac", "Artist A"),
  makeMockTrack(2, "track_2.flac", "Artist B"),
  makeMockTrack(3, "track_3.flac", "Artist C"),
];

const MOCK_REPORT: HealthReport = {
  total_tracks: 1000,
  issues: [
    { id: "missing_title", label: "Missing title", count: 5 },
    { id: "missing_artist", label: "Missing artist", count: 3 },
    { id: "missing_album", label: "Missing album", count: 2 },
    { id: "missing_genre", label: "Missing genre", count: 10 },
    { id: "missing_year", label: "Missing year", count: 20 },
    { id: "missing_track_number", label: "Missing track number", count: 15 },
    { id: "unrated", label: "Unrated", count: 500 },
    { id: "low_bitrate", label: "Low bitrate (< 128 kbps)", count: 0 },
    { id: "flagged", label: "Flagged for review", count: 8 },
    { id: "never_played", label: "Never played", count: 200 },
  ],
};

const CLEAN_REPORT: HealthReport = {
  total_tracks: 100,
  issues: [
    { id: "missing_title", label: "Missing title", count: 0 },
    { id: "missing_artist", label: "Missing artist", count: 0 },
    { id: "missing_album", label: "Missing album", count: 0 },
    { id: "missing_genre", label: "Missing genre", count: 0 },
    { id: "missing_year", label: "Missing year", count: 0 },
    { id: "missing_track_number", label: "Missing track number", count: 0 },
    { id: "unrated", label: "Unrated", count: 0 },
    { id: "low_bitrate", label: "Low bitrate (< 128 kbps)", count: 0 },
    { id: "flagged", label: "Flagged for review", count: 0 },
    { id: "never_played", label: "Never played", count: 0 },
  ],
};

const EMPTY_REPORT: HealthReport = {
  total_tracks: 0,
  issues: [],
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("LibraryHealthDashboard", () => {
  it("loads health report on mount", async () => {
    mockInvoke.mockResolvedValue(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_library_health");
    });
  });

  it("displays issue counts after loading", async () => {
    mockInvoke.mockResolvedValue(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Missing artist")).toBeInTheDocument();
  });

  it("shows all-clear message when no issues found", async () => {
    mockInvoke.mockResolvedValue(CLEAN_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/library is healthy/i)).toBeInTheDocument();
    });
  });

  it("shows empty state for empty library", async () => {
    mockInvoke.mockResolvedValue(EMPTY_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("0 tracks")).toBeInTheDocument();
    });
  });

  it("shows error with retry on failure", async () => {
    mockInvoke.mockRejectedValue("Database locked");

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Database locked")).toBeInTheDocument();
    });
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("retries on button click", async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce("Database locked").mockResolvedValueOnce(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });
  });

  it("shows total tracks in header", async () => {
    mockInvoke.mockResolvedValue(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("1,000 tracks")).toBeInTheDocument();
    });
  });

  it("only shows issues with count > 0 as actionable cards", async () => {
    mockInvoke.mockResolvedValue(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    // Low bitrate has count 0, so it should not be in the issues section
    // but it should still show as a passing check
    expect(screen.getByText("Low bitrate (< 128 kbps)")).toBeInTheDocument();
  });

  it("allows refreshing the health report", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue(CLEAN_REPORT);
    await user.click(screen.getByText("Refresh"));

    await waitFor(() => {
      expect(screen.getByText(/library is healthy/i)).toBeInTheDocument();
    });
  });
});

describe("drill-down", () => {
  it("opens detail modal when issue card is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("Missing title — 5 tracks")).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledWith("get_health_issue_tracks", { issueId: "missing_title" });
  });

  it("shows track data in the modal", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });
    expect(screen.getByText("Artist A")).toBeInTheDocument();
  });

  it("closes modal on backdrop click", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("Missing title — 5 tracks")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("modal-backdrop"));

    await waitFor(() => {
      expect(screen.queryByText("Missing title — 5 tracks")).not.toBeInTheDocument();
    });
  });

  it("shows selection count when tracks are clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    await user.click(screen.getByText("track_1.flac"));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("shows context menu on right-click with Edit Metadata option", async () => {
    const user = userEvent.setup();
    const onRepair = vi.fn();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard onRepairMetadata={onRepair} />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    // Right-click the track row
    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("track_1.flac") });

    await waitFor(() => {
      expect(screen.getByText("Edit Metadata (1 track)")).toBeInTheDocument();
    });
  });

  it("calls onRepairMetadata with selected tracks when Edit Metadata is clicked", async () => {
    const user = userEvent.setup();
    const onRepair = vi.fn();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard onRepairMetadata={onRepair} />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    // Right-click to open context menu
    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("track_1.flac") });

    await waitFor(() => {
      expect(screen.getByText("Edit Metadata (1 track)")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Edit Metadata (1 track)"));

    expect(onRepair).toHaveBeenCalledWith(MOCK_TRACKS);
  });

  it("shift+click extends selection with range", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS_MULTI);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    // Click first track
    await user.click(screen.getByText("track_1.flac"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    // Shift+click third track — should select all three
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("track_3.flac"));
    await user.keyboard("{/Shift}");

    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("does not show context menu when onRepairMetadata is not provided", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("track_1.flac") });

    // No context menu should appear
    expect(screen.queryByText(/Edit Metadata/)).not.toBeInTheDocument();
  });

  it("does not open modal for zero-count issues", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Low bitrate (< 128 kbps)")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Low bitrate (< 128 kbps)"));

    // Modal should NOT open — only the initial get_library_health call should have been made
    expect(screen.queryByText(/— 0 tracks/)).not.toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("shows auto-title button when tracks are selected in missing_title view", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    // No button before selection
    expect(screen.queryByText("Auto-title from filename")).not.toBeInTheDocument();

    await user.click(screen.getByText("track_1.flac"));

    expect(screen.getByText("Auto-title from filename")).toBeInTheDocument();
  });

  it("does not show auto-title button for non-missing-title issues", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing artist")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing artist"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    await user.click(screen.getByText("track_1.flac"));

    expect(screen.queryByText("Auto-title from filename")).not.toBeInTheDocument();
  });

  it("calls save_metadata with extracted titles when auto-title is clicked", async () => {
    const user = userEvent.setup();
    const titledTracks = [
      makeMockTrack(1, "01-02 Song One.flac", "Artist A"),
      makeMockTrack(2, "03 Song Two.mp3", "Artist B"),
    ];
    mockInvoke
      .mockResolvedValueOnce(MOCK_REPORT) // get_library_health
      .mockResolvedValueOnce(titledTracks) // get_health_issue_tracks (initial)
      .mockResolvedValueOnce({
        // save_metadata
        total: 2,
        succeeded: 2,
        failed: 0,
        cancelled: false,
        errors: [],
        undo_operations: [],
      })
      .mockResolvedValueOnce([]) // get_health_issue_tracks (refresh)
      .mockResolvedValueOnce(MOCK_REPORT); // get_library_health (onDataChanged)

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("01-02 Song One.flac")).toBeInTheDocument();
    });

    // Select first track, then shift-click second
    await user.click(screen.getByText("01-02 Song One.flac"));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("03 Song Two.mp3"));
    await user.keyboard("{/Shift}");

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await user.click(screen.getByText("Auto-title from filename"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_metadata", {
        updates: [
          { file_path: "/music/01-02 Song One.flac", title: "Song One" },
          { file_path: "/music/03 Song Two.mp3", title: "Song Two" },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Applied titles to 2 tracks")).toBeInTheDocument();
    });
  });

  it("shows auto-title option in context menu for missing_title issue", async () => {
    const user = userEvent.setup();
    const onRepair = vi.fn();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard onRepairMetadata={onRepair} />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("track_1.flac") });

    await waitFor(() => {
      expect(screen.getByText("Auto-title from filename (1 track)")).toBeInTheDocument();
      expect(screen.getByText("Edit Metadata (1 track)")).toBeInTheDocument();
    });
  });

  it("selects all tracks with Cmd+A", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS_MULTI);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing title")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing title"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    await user.keyboard("{Meta>}a{/Meta}");

    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("shows auto-track-number button when tracks are selected in missing_track_number view", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(MOCK_REPORT).mockResolvedValueOnce(MOCK_TRACKS);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing track number")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing track number"));

    await waitFor(() => {
      expect(screen.getByText("track_1.flac")).toBeInTheDocument();
    });

    expect(screen.queryByText("Auto-track number from filename")).not.toBeInTheDocument();

    await user.click(screen.getByText("track_1.flac"));

    expect(screen.getByText("Auto-track number from filename")).toBeInTheDocument();
  });

  it("calls save_metadata with extracted track numbers when auto-track-number is clicked", async () => {
    const user = userEvent.setup();
    const numberedTracks = [
      makeMockTrack(1, "01-03 Song One.flac", "Artist A"),
      makeMockTrack(2, "02-07 Song Two.mp3", "Artist B"),
    ];
    mockInvoke
      .mockResolvedValueOnce(MOCK_REPORT)
      .mockResolvedValueOnce(numberedTracks)
      .mockResolvedValueOnce({
        total: 2,
        succeeded: 2,
        failed: 0,
        cancelled: false,
        errors: [],
        undo_operations: [],
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(MOCK_REPORT);

    render(<LibraryHealthDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Missing track number")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Missing track number"));

    await waitFor(() => {
      expect(screen.getByText("01-03 Song One.flac")).toBeInTheDocument();
    });

    await user.click(screen.getByText("01-03 Song One.flac"));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("02-07 Song Two.mp3"));
    await user.keyboard("{/Shift}");

    await user.click(screen.getByText("Auto-track number from filename"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_metadata", {
        updates: [
          { file_path: "/music/01-03 Song One.flac", track: 3, disc_number: 1 },
          { file_path: "/music/02-07 Song Two.mp3", track: 7, disc_number: 2 },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Applied track numbers to 2 tracks")).toBeInTheDocument();
    });
  });
});

describe("helpers", () => {
  describe("issuePercentage", () => {
    it("formats percentage with one decimal", () => {
      expect(issuePercentage(5, 1000)).toBe("0.5%");
    });

    it("handles zero total", () => {
      expect(issuePercentage(0, 0)).toBe("0%");
    });

    it("handles 100%", () => {
      expect(issuePercentage(100, 100)).toBe("100.0%");
    });
  });

  describe("issueSeverity", () => {
    const makeIssue = (id: string, count: number): HealthIssue => ({
      id,
      label: id,
      count,
    });

    it("returns ok for zero count", () => {
      expect(issueSeverity(makeIssue("missing_title", 0), 100)).toBe("ok");
    });

    it("returns warning for low count metadata issues", () => {
      expect(issueSeverity(makeIssue("missing_title", 5), 100)).toBe("warning");
    });

    it("returns critical for high percentage metadata issues", () => {
      expect(issueSeverity(makeIssue("missing_title", 20), 100)).toBe("critical");
    });

    it("treats never_played and unrated as informational", () => {
      expect(issueSeverity(makeIssue("never_played", 50), 100)).toBe("ok");
      expect(issueSeverity(makeIssue("unrated", 50), 100)).toBe("ok");
    });

    it("warns when informational issues exceed 80%", () => {
      expect(issueSeverity(makeIssue("unrated", 90), 100)).toBe("warning");
    });
  });

  describe("extractTitleFromFileName", () => {
    it("extracts title from disc-track format", () => {
      expect(extractTitleFromFileName("01-02 Song Title.flac")).toBe("Song Title");
    });

    it("extracts title from track number with dot", () => {
      expect(extractTitleFromFileName("03. Song Title.mp3")).toBe("Song Title");
    });

    it("extracts title from track number with paren", () => {
      expect(extractTitleFromFileName("03) Song Title.mp3")).toBe("Song Title");
    });

    it("extracts title from track number with dash", () => {
      expect(extractTitleFromFileName("03 - Song Title.mp3")).toBe("Song Title");
    });

    it("extracts title from plain track number", () => {
      expect(extractTitleFromFileName("03 Song Title.mp3")).toBe("Song Title");
    });

    it("handles doubled disc-track prefix", () => {
      expect(extractTitleFromFileName("01-02 01-02 Song Title.flac")).toBe("Song Title");
    });

    it("preserves ordinal numbers at start of title", () => {
      expect(extractTitleFromFileName("01-02 4th of July.mp3")).toBe("4th of July");
    });

    it("preserves ordinal after stripping disc-track and track number", () => {
      expect(extractTitleFromFileName("01-02 2 4th of July, Ashbury Park.mp3")).toBe("4th of July, Ashbury Park");
    });

    it("uses full name when no track prefix exists", () => {
      expect(extractTitleFromFileName("Song Title.flac")).toBe("Song Title");
    });

    it("returns null for empty result", () => {
      expect(extractTitleFromFileName(".mp3")).toBeNull();
    });

    it("returns null for extension-only filename", () => {
      expect(extractTitleFromFileName("01-02.flac")).toBeNull();
    });

    it("handles m4a extension", () => {
      expect(extractTitleFromFileName("01-01 My Song.m4a")).toBe("My Song");
    });

    it("handles wav extension", () => {
      expect(extractTitleFromFileName("05 Track Five.wav")).toBe("Track Five");
    });

    it("does not strip ordinal-looking track numbers like 1st, 2nd, 3rd", () => {
      expect(extractTitleFromFileName("1st Avenue.mp3")).toBe("1st Avenue");
    });

    it("handles underscore-separated filenames", () => {
      expect(extractTitleFromFileName("01_Song_Title.mp3")).toBe("Song Title");
    });

    it("handles underscore dash separator", () => {
      expect(extractTitleFromFileName("03_-_Song_Title.mp3")).toBe("Song Title");
    });

    it("handles disc-track with underscores", () => {
      expect(extractTitleFromFileName("01-02_Song_Title.flac")).toBe("Song Title");
    });

    it("normalizes underscores to spaces in result", () => {
      expect(extractTitleFromFileName("My_Great_Song.flac")).toBe("My Great Song");
    });
  });

  describe("extractTrackInfoFromFileName", () => {
    it("extracts disc and track from DD-TT format", () => {
      expect(extractTrackInfoFromFileName("01-02 Song Title.flac")).toEqual({ discNumber: 1, trackNumber: 2 });
    });

    it("extracts disc and track with underscore separator", () => {
      expect(extractTrackInfoFromFileName("02-05_Song.mp3")).toEqual({ discNumber: 2, trackNumber: 5 });
    });

    it("handles single-digit disc and track", () => {
      expect(extractTrackInfoFromFileName("1-3 Song.flac")).toEqual({ discNumber: 1, trackNumber: 3 });
    });

    it("returns null for plain track number without disc", () => {
      expect(extractTrackInfoFromFileName("03 Song Title.mp3")).toBeNull();
    });

    it("returns null for no number prefix", () => {
      expect(extractTrackInfoFromFileName("Song Title.mp3")).toBeNull();
    });

    it("returns null for track number 0", () => {
      expect(extractTrackInfoFromFileName("01-00 Intro.flac")).toBeNull();
    });

    it("defaults disc to 1 when disc is 0", () => {
      expect(extractTrackInfoFromFileName("00-05 Song.mp3")).toEqual({ discNumber: 1, trackNumber: 5 });
    });

    it("returns null for filename without DD-TT prefix", () => {
      expect(extractTrackInfoFromFileName("03. Song Title.mp3")).toBeNull();
    });
  });
});
