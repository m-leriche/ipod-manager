import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DuplicateDetector } from "./DuplicateDetector";
import { formatSize, formatDuration, qualityLabel } from "./helpers";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

const MOCK_TRACK_A = {
  id: 1,
  file_path: "/music/Artist/Album/song.flac",
  file_name: "song.flac",
  folder_path: "/music/Artist/Album",
  title: "My Song",
  artist: "My Artist",
  album: "My Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: 10,
  disc_number: 1,
  disc_total: 1,
  year: 2023,
  genre: "Rock",
  duration_secs: 245,
  sample_rate: 44100,
  bitrate_kbps: 1411,
  format: "FLAC",
  file_size: 43_000_000,
  created_at: 1700000000,
  play_count: 5,
  flagged: false,
  rating: 4,
};

const MOCK_TRACK_B = {
  ...MOCK_TRACK_A,
  id: 2,
  file_path: "/music/Artist/Album/song.mp3",
  file_name: "song.mp3",
  format: "MP3",
  bitrate_kbps: 320,
  file_size: 12_000_000,
  sample_rate: 44100,
};

const MOCK_RESULT = {
  groups: [
    {
      group_id: 1,
      fingerprint: "abc123",
      duration_mismatch: false,
      tracks: [
        { track: MOCK_TRACK_A, quality_score: 100, is_recommended: true },
        { track: MOCK_TRACK_B, quality_score: 50, is_recommended: false },
      ],
    },
  ],
  total_duplicate_tracks: 2,
  potential_space_savings: 12_000_000,
};

const EMPTY_RESULT = {
  groups: [],
  total_duplicate_tracks: 0,
  potential_space_savings: 0,
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockListen.mockResolvedValue(vi.fn());
});

describe("DuplicateDetector", () => {
  it("shows initial scan prompt", () => {
    render(<DuplicateDetector />);
    expect(screen.getByRole("button", { name: /Scan for Duplicates/ })).toBeInTheDocument();
    expect(screen.getByText(/Click "Scan for Duplicates" to find/)).toBeInTheDocument();
  });

  it("calls detect_duplicates when scan button is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(EMPTY_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("detect_duplicates");
    });
  });

  it("shows 'no duplicates' when none found", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(EMPTY_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(screen.getByText("No duplicates found")).toBeInTheDocument();
    });
  });

  it("displays duplicate groups after scan", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(screen.getByText("My Song")).toBeInTheDocument();
      expect(screen.getByText("My Artist")).toBeInTheDocument();
      expect(screen.getByText("2 copies")).toBeInTheDocument();
    });
  });

  it("shows summary stats after scan", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      // Text is split by <strong> tags, so match individual text nodes
      expect(screen.getByText("duplicate group")).toBeInTheDocument();
      expect(screen.getByText("total tracks")).toBeInTheDocument();
      expect(screen.getByText(/potential.*savings/)).toBeInTheDocument();
    });
  });

  it("pre-selects non-recommended tracks for deletion", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      const checkboxes = screen.getAllByRole("checkbox");
      // First checkbox (recommended track) should be unchecked
      expect(checkboxes[0]).not.toBeChecked();
      // Second checkbox (non-recommended) should be checked
      expect(checkboxes[1]).toBeChecked();
    });
  });

  it("shows Best badge on recommended track", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(screen.getByText("Best")).toBeInTheDocument();
    });
  });

  it("toggles track selection on checkbox click", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => screen.getAllByRole("checkbox"));

    const checkboxes = screen.getAllByRole("checkbox");
    // Uncheck the pre-selected non-recommended track
    await user.click(checkboxes[1]);
    expect(checkboxes[1]).not.toBeChecked();

    // Check it again
    await user.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();
  });

  it("deselect all clears selection", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => screen.getByText("Deselect All"));
    await user.click(screen.getByText("Deselect All"));

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("select all duplicates re-selects non-recommended", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => screen.getByText("Deselect All"));
    await user.click(screen.getByText("Deselect All"));

    await user.click(screen.getByText("Select All Duplicates"));

    const checkboxes = screen.getAllByRole("checkbox");
    // Non-recommended should be checked again
    expect(checkboxes[1]).toBeChecked();
  });

  it("shows delete button with count and size when tracks are selected", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(screen.getByText(/Delete 1 tracks/)).toBeInTheDocument();
    });
  });

  it("shows confirmation dialog on delete click", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => screen.getByText(/Delete 1 tracks/));
    await user.click(screen.getByText(/Delete 1 tracks/));

    await waitFor(() => {
      expect(screen.getByText("Delete Duplicate Tracks")).toBeInTheDocument();
      expect(screen.getByText(/permanently delete/)).toBeInTheDocument();
    });
  });

  it("shows duration mismatch badge", async () => {
    const user = userEvent.setup();
    const resultWithMismatch = {
      ...MOCK_RESULT,
      groups: [{ ...MOCK_RESULT.groups[0], duration_mismatch: true }],
    };
    mockInvoke.mockResolvedValue(resultWithMismatch);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(screen.getByText("Duration mismatch")).toBeInTheDocument();
    });
  });

  it("shows action bar with select/deselect buttons", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(screen.getByText("Select All Duplicates")).toBeInTheDocument();
      expect(screen.getByText("Deselect All")).toBeInTheDocument();
    });
  });

  it("shows format and bitrate for each track", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<DuplicateDetector />);
    await user.click(screen.getByRole("button", { name: /Scan for Duplicates/ }));

    await waitFor(() => {
      expect(screen.getByText("FLAC")).toBeInTheDocument();
      expect(screen.getByText("MP3")).toBeInTheDocument();
      expect(screen.getByText("1411k")).toBeInTheDocument();
      expect(screen.getByText("320k")).toBeInTheDocument();
    });
  });
});

describe("formatSize", () => {
  it("formats bytes", () => expect(formatSize(500)).toBe("500 B"));
  it("formats KB", () => expect(formatSize(1536)).toBe("1.5 KB"));
  it("formats MB", () => expect(formatSize(12_000_000)).toBe("11.4 MB"));
  it("formats GB", () => expect(formatSize(2_147_483_648)).toBe("2.00 GB"));
});

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(245)).toBe("4:05");
  });
});

describe("qualityLabel", () => {
  it("labels lossless", () => expect(qualityLabel(100)).toBe("Lossless"));
  it("labels high", () => expect(qualityLabel(75)).toBe("High"));
  it("labels good", () => expect(qualityLabel(30)).toBe("Good"));
  it("labels low", () => expect(qualityLabel(10)).toBe("Low"));
});
