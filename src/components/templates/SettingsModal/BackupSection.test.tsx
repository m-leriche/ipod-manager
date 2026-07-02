import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { BackupSection } from "./BackupSection";
import type { BackupInfo } from "./types";

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}));

const BACKUPS: BackupInfo[] = [
  { path: "/backups/library_2000.db", size: 2 * 1024 * 1024, created_at: 2000 },
  { path: "/backups/library_1000.db", size: 512 * 1024, created_at: 1000 },
];

const mockBackend = (backups: BackupInfo[]) => {
  vi.mocked(invoke).mockImplementation((cmd) => {
    switch (cmd) {
      case "list_library_backups":
        return Promise.resolve(backups);
      case "backup_library":
        return Promise.resolve(BACKUPS[0]);
      case "restore_library_backup":
        return Promise.resolve({ restored_from: BACKUPS[0].path, restart_required: true });
      default:
        return Promise.resolve(null);
    }
  });
};

describe("BackupSection", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(relaunch).mockClear();
  });

  it("lists existing backups with size", async () => {
    mockBackend(BACKUPS);
    render(<BackupSection />);
    await waitFor(() => expect(screen.getByTestId("backup-list")).toBeInTheDocument());
    expect(screen.getByText(/2 backups/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
  });

  it("creates a backup and refreshes the list", async () => {
    mockBackend([]);
    render(<BackupSection />);
    await waitFor(() => expect(screen.getByText(/0 backups/)).toBeInTheDocument());

    mockBackend(BACKUPS);
    await userEvent.click(screen.getByTestId("backup-now"));
    await waitFor(() => expect(screen.getByText(/2 backups/)).toBeInTheDocument());
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "backup_library")).toBe(true);
  });

  it("requires confirmation before restoring, then relaunches", async () => {
    mockBackend(BACKUPS);
    render(<BackupSection />);
    await waitFor(() => expect(screen.getByTestId("backup-list")).toBeInTheDocument());

    // First click only arms the confirmation — nothing is restored.
    await userEvent.click(screen.getByTestId("restore-2000"));
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "restore_library_backup")).toBe(false);

    await userEvent.click(screen.getByTestId("confirm-restore"));
    await waitFor(() =>
      expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "restore_library_backup")).toBe(true),
    );
    await waitFor(() => expect(relaunch).toHaveBeenCalled());
  });

  it("shows an error and stays usable when restore fails", async () => {
    mockBackend(BACKUPS);
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "list_library_backups") return Promise.resolve(BACKUPS);
      if (cmd === "restore_library_backup") return Promise.reject(new Error("bad file"));
      return Promise.resolve(null);
    });
    render(<BackupSection />);
    await waitFor(() => expect(screen.getByTestId("backup-list")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("restore-2000"));
    await userEvent.click(screen.getByTestId("confirm-restore"));
    await waitFor(() => expect(screen.getByTestId("backup-error")).toBeInTheDocument());
    expect(relaunch).not.toHaveBeenCalled();
  });
});
