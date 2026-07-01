import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { MountPanel } from "./MountPanel";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const DISK_INFO = {
  identifier: "disk5s1",
  size: "119.1 GB",
  name: "IPOD",
  mounted: true,
  mount_point: "/Volumes/IPOD",
  free_space: 50_000_000_000,
  used_space: 69_100_000_000,
  total_space: 119_100_000_000,
  media_name: "iPod Classic",
};

describe("MountPanel", () => {
  // ── Hero (non-compact, shown when no iPod is mounted) ──
  describe("hero", () => {
    it("shows a No iPod connected hero when none is detected", async () => {
      mockInvoke.mockResolvedValue(null);
      render(<MountPanel />);
      await waitFor(() => {
        expect(screen.getByText("No iPod connected")).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: "Scan Again" })).toBeInTheDocument();
    });

    it("shows password input when an iPod is found but not mounted", async () => {
      mockInvoke.mockResolvedValue({ ...DISK_INFO, mounted: false, mount_point: null });
      render(<MountPanel />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText("macOS password")).toBeInTheDocument();
      });
      expect(screen.getByText("iPod found")).toBeInTheDocument();
    });

    it("enables the Mount button only when a password is entered", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockInvoke.mockResolvedValue({ ...DISK_INFO, mounted: false, mount_point: null });
      render(<MountPanel />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Mount iPod" })).toBeDisabled();
      });

      await user.type(screen.getByPlaceholderText("macOS password"), "secret");
      expect(screen.getByRole("button", { name: "Mount iPod" })).toBeEnabled();
    });
  });

  // ── Compact card (shown alongside the summary when mounted) ──
  describe("compact card", () => {
    it("shows Mounted with device info when iPod is mounted", async () => {
      mockInvoke.mockResolvedValue(DISK_INFO);
      render(<MountPanel compact />);
      await waitFor(() => {
        expect(screen.getByText("Mounted")).toBeInTheDocument();
        expect(screen.getByText("/dev/disk5s1")).toBeInTheDocument();
        expect(screen.getByText("119.1 GB")).toBeInTheDocument();
      });
    });

    it("shows media name as Type when available", async () => {
      mockInvoke.mockResolvedValue(DISK_INFO);
      render(<MountPanel compact />);
      await waitFor(() => {
        expect(screen.getByText("iPod Classic")).toBeInTheDocument();
      });
    });

    it("enables the Eject button when iPod is mounted", async () => {
      mockInvoke.mockResolvedValue(DISK_INFO);
      render(<MountPanel compact />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Eject" })).toBeEnabled();
      });
    });
  });

  // ── Callbacks (layout-agnostic) ──
  it("calls onMountChange(true) when iPod is mounted", async () => {
    const onMountChange = vi.fn();
    mockInvoke.mockResolvedValue(DISK_INFO);
    render(<MountPanel onMountChange={onMountChange} />);
    await waitFor(() => {
      expect(onMountChange).toHaveBeenCalledWith(true);
    });
  });

  it("calls onMountChange(false) when iPod is not found", async () => {
    const onMountChange = vi.fn();
    mockInvoke.mockResolvedValue(null);
    render(<MountPanel onMountChange={onMountChange} />);
    await waitFor(() => {
      expect(onMountChange).toHaveBeenCalledWith(false);
    });
  });

  it("calls detect_ipod on mount", async () => {
    mockInvoke.mockResolvedValue(null);
    render(<MountPanel />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("detect_ipod");
    });
  });

  it("calls onDiskInfoChange with disk info when iPod is detected", async () => {
    const onDiskInfoChange = vi.fn();
    mockInvoke.mockResolvedValue(DISK_INFO);
    render(<MountPanel onDiskInfoChange={onDiskInfoChange} />);
    await waitFor(() => {
      expect(onDiskInfoChange).toHaveBeenCalledWith(DISK_INFO);
    });
  });

  it("calls onDiskInfoChange with null when iPod is not found", async () => {
    const onDiskInfoChange = vi.fn();
    mockInvoke.mockResolvedValue(null);
    render(<MountPanel onDiskInfoChange={onDiskInfoChange} />);
    await waitFor(() => {
      expect(onDiskInfoChange).toHaveBeenCalledWith(null);
    });
  });
});
