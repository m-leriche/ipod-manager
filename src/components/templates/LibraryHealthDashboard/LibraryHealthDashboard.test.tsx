import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LibraryHealthDashboard } from "./LibraryHealthDashboard";
import { issuePercentage, issueSeverity } from "./helpers";
import type { HealthReport, HealthIssue } from "./types";

const mockInvoke = vi.mocked(invoke);

const MOCK_REPORT: HealthReport = {
  total_tracks: 1000,
  issues: [
    { id: "missing_title", label: "Missing title", count: 5 },
    { id: "missing_artist", label: "Missing artist", count: 3 },
    { id: "missing_album", label: "Missing album", count: 2 },
    { id: "missing_genre", label: "Missing genre", count: 10 },
    { id: "missing_year", label: "Missing year", count: 20 },
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
});
