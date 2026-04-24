import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { IpodSummary } from "./IpodSummary";
import type { DiskInfo } from "../MountPanel/types";
import type { IpodInfo } from "../../../types/ipod";

const mockDiskInfo: DiskInfo = {
  identifier: "disk5s2",
  size: "119.1 GB",
  name: "IPOD",
  mounted: true,
  mount_point: "/Volumes/IPOD",
  free_space: 60_000_000_000,
  used_space: 59_100_000_000,
  total_space: 119_100_000_000,
  media_name: "iPod Classic",
};

const mockIpodInfo: IpodInfo = {
  volume_name: "IPOD",
  identifier: "disk5s2",
  mount_point: "/Volumes/IPOD",
  total_space: 119_100_000_000,
  used_space: 59_100_000_000,
  free_space: 60_000_000_000,
  format: "FAT32",
  serial_number: "YM634ABC123",
  model_number: "MA448",
  model_name: "iPod 5.5th Gen (80GB)",
  firmware_version: "1.3.0",
  rockbox_version: "4.0-20240101",
  has_rockbox: true,
  audio_space: 45_000_000_000,
  other_space: 14_100_000_000,
  rockbox_track_count: 3500,
};

describe("IpodSummary", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("shows empty state when iPod is not mounted", () => {
    render(<IpodSummary diskInfo={null} isMounted={false} />);
    expect(screen.getByText("Connect and mount your iPod to see device info")).toBeInTheDocument();
  });

  it("shows loading state while fetching info", () => {
    vi.mocked(invoke).mockReturnValue(new Promise(() => {})); // never resolves
    render(<IpodSummary diskInfo={mockDiskInfo} isMounted={true} />);
    expect(screen.getByText("Reading device info...")).toBeInTheDocument();
  });

  it("displays device info after loading", async () => {
    vi.mocked(invoke).mockResolvedValue(mockIpodInfo);
    render(<IpodSummary diskInfo={mockDiskInfo} isMounted={true} />);

    await waitFor(() => {
      expect(screen.getByText("IPOD")).toBeInTheDocument();
    });

    expect(screen.getAllByText("iPod 5.5th Gen (80GB)")).toHaveLength(2); // header + info row
    expect(screen.getByText("YM634ABC123")).toBeInTheDocument();
    expect(screen.getByText("1.3.0")).toBeInTheDocument();
    expect(screen.getByText("FAT32")).toBeInTheDocument();
  });

  it("displays Rockbox info when available", async () => {
    vi.mocked(invoke).mockResolvedValue(mockIpodInfo);
    render(<IpodSummary diskInfo={mockDiskInfo} isMounted={true} />);

    await waitFor(() => {
      expect(screen.getByText("Rockbox")).toBeInTheDocument();
    });

    expect(screen.getByText("4.0-20240101")).toBeInTheDocument();
    expect(screen.getByText("3,500 tracks")).toBeInTheDocument();
  });

  it("hides Rockbox section when not installed", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...mockIpodInfo, has_rockbox: false });
    render(<IpodSummary diskInfo={mockDiskInfo} isMounted={true} />);

    await waitFor(() => {
      expect(screen.getByText("IPOD")).toBeInTheDocument();
    });

    expect(screen.queryByText("Rockbox")).not.toBeInTheDocument();
  });

  it("shows error state on failure", async () => {
    vi.mocked(invoke).mockRejectedValue("Device read error");
    render(<IpodSummary diskInfo={mockDiskInfo} isMounted={true} />);

    await waitFor(() => {
      expect(screen.getByText("Device read error")).toBeInTheDocument();
    });
  });

  it("shows storage bar with correct labels", async () => {
    vi.mocked(invoke).mockResolvedValue(mockIpodInfo);
    render(<IpodSummary diskInfo={mockDiskInfo} isMounted={true} />);

    await waitFor(() => {
      expect(screen.getByText("Storage")).toBeInTheDocument();
    });

    expect(screen.getByText(/Audio/)).toBeInTheDocument();
    expect(screen.getByText(/Other/)).toBeInTheDocument();
    expect(screen.getByText(/Free/)).toBeInTheDocument();
  });

  it("gracefully handles missing optional fields", async () => {
    const minimalInfo: IpodInfo = {
      ...mockIpodInfo,
      serial_number: null,
      model_number: null,
      model_name: null,
      firmware_version: null,
      has_rockbox: false,
      rockbox_version: null,
      rockbox_track_count: null,
    };
    vi.mocked(invoke).mockResolvedValue(minimalInfo);
    render(<IpodSummary diskInfo={mockDiskInfo} isMounted={true} />);

    await waitFor(() => {
      expect(screen.getByText("IPOD")).toBeInTheDocument();
    });

    expect(screen.queryByText("Serial")).not.toBeInTheDocument();
    expect(screen.queryByText("Firmware")).not.toBeInTheDocument();
    expect(screen.queryByText("Rockbox")).not.toBeInTheDocument();
  });
});
