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
};

describe("MountPanel", () => {
  it("shows Disconnected when no iPod is detected", async () => {
    mockInvoke.mockResolvedValue(null);
    render(<MountPanel />);
    await waitFor(() => {
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });
  });

  it("shows Connected when iPod is detected but not mounted", async () => {
    mockInvoke.mockResolvedValue({ ...DISK_INFO, mounted: false, mount_point: null });
    render(<MountPanel />);
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });
  });

  it("shows Mounted with device info when iPod is mounted", async () => {
    mockInvoke.mockResolvedValue(DISK_INFO);
    render(<MountPanel />);
    await waitFor(() => {
      expect(screen.getByText("Mounted")).toBeInTheDocument();
      expect(screen.getByText("/dev/disk5s1")).toBeInTheDocument();
      expect(screen.getByText("119.1 GB")).toBeInTheDocument();
    });
  });

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

  it("shows password input when iPod is connected but not mounted", async () => {
    mockInvoke.mockResolvedValue({ ...DISK_INFO, mounted: false, mount_point: null });
    render(<MountPanel />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("macOS password")).toBeInTheDocument();
    });
  });

  it("enables Mount button only when password is entered", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockInvoke.mockResolvedValue({ ...DISK_INFO, mounted: false, mount_point: null });
    render(<MountPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mount" })).toBeDisabled();
    });

    await user.type(screen.getByPlaceholderText("macOS password"), "secret");
    expect(screen.getByRole("button", { name: "Mount" })).toBeEnabled();
  });

  it("enables Eject button only when iPod is mounted", async () => {
    mockInvoke.mockResolvedValue(DISK_INFO);
    render(<MountPanel />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Eject" })).toBeEnabled();
    });
  });

  it("disables Eject button when iPod is not mounted", async () => {
    mockInvoke.mockResolvedValue(null);
    render(<MountPanel />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Eject" })).toBeDisabled();
    });
  });

  it("calls detect_ipod on mount", async () => {
    mockInvoke.mockResolvedValue(null);
    render(<MountPanel />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("detect_ipod");
    });
  });
});
