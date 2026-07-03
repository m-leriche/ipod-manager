import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { PlaylistSyncModal } from "./PlaylistSyncModal";
import type { IpodInfo } from "../../../types/ipod";
import type { PlaylistSyncPlan, PlaylistSyncResult } from "./types";

const mockInfo: IpodInfo = {
  volume_name: "IPOD",
  identifier: "disk5s2",
  mount_point: "/Volumes/IPOD",
  total_space: 119_100_000_000,
  used_space: 59_100_000_000,
  free_space: 60_000_000_000,
  format: "FAT32",
  serial_number: null,
  model_number: null,
  model_name: null,
  firmware_version: null,
  rockbox_version: null,
  has_rockbox: true,
  audio_space: 45_000_000_000,
  other_space: 14_100_000_000,
  rockbox_track_count: null,
};

const mockPlaylists = [
  { id: 1, name: "Road Trip", track_count: 12, total_duration: 3600, created_at: 0, updated_at: 0 },
];

const mockSmartPlaylists = [
  {
    id: 7,
    name: "Top Rated",
    icon: null,
    rules: { match: "all" as const, rules: [] },
    sort_by: null,
    sort_direction: null,
    track_limit: null,
    is_builtin: false,
    created_at: 0,
    updated_at: 0,
  },
];

const mockPlan: PlaylistSyncPlan = {
  playlists: [{ id: 1, is_smart: false, name: "Road Trip", track_count: 12 }],
  total_tracks: 12,
  files_to_copy: 10,
  bytes_to_copy: 500 * 1024 * 1024,
  bytes_already_present: 100 * 1024 * 1024,
  free_space: 60_000_000_000,
  errors: [],
};

const mockResult: PlaylistSyncResult = {
  copied: 10,
  already_present: 2,
  playlists_written: 1,
  cancelled: false,
  errors: [],
};

const setupInvoke = (overrides: Record<string, unknown> = {}) => {
  const responses: Record<string, unknown> = {
    get_playlists: mockPlaylists,
    get_smart_playlists: mockSmartPlaylists,
    plan_playlist_sync: mockPlan,
    sync_playlists_to_ipod: mockResult,
    cancel_sync: null,
    ...overrides,
  };
  vi.mocked(invoke).mockImplementation((cmd: string) => Promise.resolve(responses[cmd]));
};

const onClose = vi.fn();

describe("PlaylistSyncModal", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    onClose.mockReset();
  });

  it("renders regular and smart playlists with track counts", async () => {
    setupInvoke();
    render(<PlaylistSyncModal info={mockInfo} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Road Trip")).toBeInTheDocument();
    });
    expect(screen.getByText("12 tracks")).toBeInTheDocument();
    expect(screen.getByText("Top Rated")).toBeInTheDocument();
    expect(screen.getByText("Smart")).toBeInTheDocument();
  });

  it("shows empty state when there are no playlists", async () => {
    setupInvoke({ get_playlists: [], get_smart_playlists: [] });
    render(<PlaylistSyncModal info={mockInfo} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("No playlists in your library yet.")).toBeInTheDocument();
    });
  });

  it("requests a preflight plan when a playlist is selected and shows capacity", async () => {
    setupInvoke();
    render(<PlaylistSyncModal info={mockInfo} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Road Trip")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /Road Trip/ }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("plan_playlist_sync", {
        playlistIds: [1],
        smartPlaylistIds: [],
        mountPoint: "/Volumes/IPOD",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/500\.0 MB to copy/)).toBeInTheDocument();
    });
    expect(screen.getByText(/100\.0 MB already on iPod/)).toBeInTheDocument();
    expect(screen.getByText(/To copy:/)).toBeInTheDocument();
    expect(screen.getByText(/Free after:/)).toBeInTheDocument();
  });

  it("disables sync until a playlist is selected and a plan is loaded", async () => {
    setupInvoke();
    render(<PlaylistSyncModal info={mockInfo} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Road Trip")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Sync" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Road Trip/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sync (1)" })).toBeEnabled();
    });
  });

  it("disables sync and warns when the plan exceeds free space", async () => {
    setupInvoke({
      plan_playlist_sync: { ...mockPlan, bytes_to_copy: 70_000_000_000, free_space: 60_000_000_000 },
    });
    render(<PlaylistSyncModal info={mockInfo} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Road Trip")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Road Trip/ }));

    await waitFor(() => {
      expect(screen.getByText(/Not enough free space/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Sync (1)" })).toBeDisabled();
  });

  it("invokes sync with selected ids and shows the result", async () => {
    setupInvoke();
    render(<PlaylistSyncModal info={mockInfo} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Top Rated")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Road Trip/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Top Rated/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sync (2)" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync (2)" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("sync_playlists_to_ipod", {
        playlistIds: [1],
        smartPlaylistIds: [7],
        mountPoint: "/Volumes/IPOD",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Already There")).toBeInTheDocument();
    expect(screen.getByText("Playlists")).toBeInTheDocument();
  });

  it("shows an error when the sync fails", async () => {
    setupInvoke();
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "sync_playlists_to_ipod") return Promise.reject("Not enough space on iPod");
      if (cmd === "get_playlists") return Promise.resolve(mockPlaylists);
      if (cmd === "get_smart_playlists") return Promise.resolve(mockSmartPlaylists);
      if (cmd === "plan_playlist_sync") return Promise.resolve(mockPlan);
      return Promise.resolve(null);
    });
    render(<PlaylistSyncModal info={mockInfo} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Road Trip")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Road Trip/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sync (1)" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync (1)" }));

    await waitFor(() => {
      expect(screen.getByText("Not enough space on iPod")).toBeInTheDocument();
    });
  });
});
