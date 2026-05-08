import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { LibraryExport } from "./LibraryExport";
import { formatBytes, defaultExportFilename } from "./helpers";
import type { ExportResult, ImportResult } from "./types";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const MOCK_EXPORT_RESULT: ExportResult = {
  path: "/Users/test/backup/crate-library-backup-2026-05-08.json",
  track_count: 1500,
  playlist_count: 5,
  smart_playlist_count: 3,
  file_size: 2_500_000,
};

const MOCK_IMPORT_RESULT: ImportResult = {
  tracks_updated: 1200,
  tracks_skipped: 300,
  playlists_imported: 4,
  playlists_skipped: 1,
  smart_playlists_imported: 2,
  smart_playlists_skipped: 1,
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
});

describe("LibraryExport — export", () => {
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
    mockInvoke.mockResolvedValue(MOCK_EXPORT_RESULT);

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
    mockInvoke.mockResolvedValue(MOCK_EXPORT_RESULT);

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
    mockInvoke.mockResolvedValue(MOCK_EXPORT_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByText("Export Library"));

    await waitFor(() => {
      expect(screen.getByText("1,500 tracks")).toBeInTheDocument();
    });

    expect(screen.getByText("Export Again")).toBeInTheDocument();
  });
});

describe("LibraryExport — import", () => {
  it("shows import button on mount", () => {
    render(<LibraryExport />);
    expect(screen.getByRole("button", { name: "Import from Backup" })).toBeInTheDocument();
  });

  it("describes what import does", () => {
    render(<LibraryExport />);
    expect(screen.getByText(/Restore ratings, play counts/i)).toBeInTheDocument();
  });

  it("opens file picker when import button is clicked", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup/crate-library-backup.json");
    mockInvoke.mockResolvedValue(MOCK_IMPORT_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByRole("button", { name: "Import from Backup" }));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith(
        expect.objectContaining({ filters: [{ name: "JSON", extensions: ["json"] }] }),
      );
    });
  });

  it("does nothing if file picker is cancelled", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue(null);

    render(<LibraryExport />);
    await user.click(screen.getByRole("button", { name: "Import from Backup" }));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("calls import_library with selected file", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup.json");
    mockInvoke.mockResolvedValue(MOCK_IMPORT_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByRole("button", { name: "Import from Backup" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("import_library", { inputPath: "/Users/test/backup.json" });
    });
  });

  it("shows import results after success", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup.json");
    mockInvoke.mockResolvedValue(MOCK_IMPORT_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByRole("button", { name: "Import from Backup" }));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
    });
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows error on import failure", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup.json");
    mockInvoke.mockRejectedValue("Invalid backup file");

    render(<LibraryExport />);
    await user.click(screen.getByRole("button", { name: "Import from Backup" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid backup file")).toBeInTheDocument();
    });
  });

  it("allows importing again after completion", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Users/test/backup.json");
    mockInvoke.mockResolvedValue(MOCK_IMPORT_RESULT);

    render(<LibraryExport />);
    await user.click(screen.getByRole("button", { name: "Import from Backup" }));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Import Again" })).toBeInTheDocument();
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
