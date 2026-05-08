import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { LibraryExport } from "./LibraryExport";
import { formatBytes, defaultExportFilename } from "./helpers";
import type { ExportResult } from "./types";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const MOCK_RESULT: ExportResult = {
  path: "/Users/test/backup/crate-library-backup-2026-05-08.json",
  track_count: 1500,
  playlist_count: 5,
  smart_playlist_count: 3,
  file_size: 2_500_000,
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
});

describe("LibraryExport", () => {
  it("shows export button on mount", () => {
    render(<LibraryExport />);
    expect(screen.getByText("Export Library")).toBeInTheDocument();
  });

  it("describes what will be exported", () => {
    render(<LibraryExport />);
    expect(screen.getByText(/tracks, playlists, ratings/i)).toBeInTheDocument();
  });

  it("opens folder picker when export button is clicked", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup");
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByText("Export Library"));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  it("does nothing if folder picker is cancelled", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue(null);

    render(<LibraryExport />);
    await user.click(screen.getByText("Export Library"));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("shows success summary after export", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup");
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByText("Export Library"));

    await waitFor(() => {
      expect(screen.getByText("1,500 tracks")).toBeInTheDocument();
    });
    expect(screen.getByText("5 playlists")).toBeInTheDocument();
    expect(screen.getByText("3 smart playlists")).toBeInTheDocument();
  });

  it("shows error on export failure", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup");
    mockInvoke.mockRejectedValue("Permission denied");

    render(<LibraryExport />);
    await user.click(screen.getByText("Export Library"));

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });
  });

  it("allows exporting again after completion", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup");
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByText("Export Library"));

    await waitFor(() => {
      expect(screen.getByText("1,500 tracks")).toBeInTheDocument();
    });

    expect(screen.getByText("Export Again")).toBeInTheDocument();
  });
});

describe("helpers", () => {
  describe("formatBytes", () => {
    it("formats bytes", () => expect(formatBytes(500)).toBe("500 B"));
    it("formats KB", () => expect(formatBytes(1536)).toBe("1.5 KB"));
    it("formats MB", () => expect(formatBytes(2_500_000)).toBe("2.4 MB"));
    it("formats GB", () => expect(formatBytes(2_147_483_648)).toBe("2.00 GB"));
    it("handles zero", () => expect(formatBytes(0)).toBe("0 B"));
  });

  describe("defaultExportFilename", () => {
    it("returns a filename with today's date", () => {
      const name = defaultExportFilename();
      expect(name).toMatch(/^crate-library-backup-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });
});
