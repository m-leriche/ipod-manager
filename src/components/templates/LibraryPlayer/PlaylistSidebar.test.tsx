import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaylistSidebar } from "./PlaylistSidebar";
import type { Playlist, SmartPlaylist } from "../../../types/library";

const PLAYLISTS: Playlist[] = [
  { id: 1, name: "Rock Classics", track_count: 20, total_duration: 3600, created_at: 0, updated_at: 0 },
  { id: 2, name: "Chill Vibes", track_count: 10, total_duration: 1800, created_at: 0, updated_at: 0 },
];

const SMART_PLAYLISTS: SmartPlaylist[] = [
  {
    id: 10,
    name: "Recently Added",
    icon: "clock",
    rules: { match: "all", rules: [] },
    sort_by: null,
    sort_direction: null,
    track_limit: null,
    is_builtin: false,
    created_at: 0,
    updated_at: 0,
  },
];

const mockDeletePlaylist = vi.fn();
const mockDeleteSmartPlaylist = vi.fn();

vi.mock("../../../contexts/PlaylistContext", () => ({
  usePlaylist: () => ({
    playlists: PLAYLISTS,
    activePlaylistId: null,
    activePlaylistTracks: [],
    loading: false,
    setActivePlaylist: vi.fn(),
    refresh: vi.fn(),
    createPlaylist: vi.fn(),
    renamePlaylist: vi.fn(),
    deletePlaylist: mockDeletePlaylist,
    addTracks: vi.fn(),
    removeTracks: vi.fn(),
    moveTrack: vi.fn(),
    exportToIpod: vi.fn(),
    smartPlaylists: SMART_PLAYLISTS,
    activeSmartPlaylistId: null,
    activeSmartPlaylistTracks: [],
    setActiveSmartPlaylist: vi.fn(),
    createSmartPlaylist: vi.fn(),
    updateSmartPlaylist: vi.fn(),
    deleteSmartPlaylist: mockDeleteSmartPlaylist,
    refreshSmartPlaylists: vi.fn(),
  }),
  PlaylistProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const defaultProps = {
  onPlaylistSelect: vi.fn(),
  activePlaylistId: null,
  onSmartPlaylistEdit: vi.fn(),
  onSmartPlaylistCreate: vi.fn(),
};

describe("PlaylistSidebar", () => {
  beforeEach(() => {
    mockDeletePlaylist.mockReset();
    mockDeleteSmartPlaylist.mockReset();
  });
  it("shows confirmation dialog when deleting a playlist via context menu", async () => {
    const user = userEvent.setup();
    render(<PlaylistSidebar {...defaultProps} />);

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Rock Classics") });

    await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
    await user.click(screen.getByText("Delete"));

    expect(screen.getByText("Delete Playlist")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete "Rock Classics"/)).toBeInTheDocument();
  });

  it("does not delete playlist until confirmed", async () => {
    const user = userEvent.setup();
    render(<PlaylistSidebar {...defaultProps} />);

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Rock Classics") });
    await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
    await user.click(screen.getByText("Delete"));

    expect(mockDeletePlaylist).not.toHaveBeenCalled();

    // Click the confirm Delete button in the dialog
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    const confirmBtn = deleteButtons[deleteButtons.length - 1];
    await user.click(confirmBtn);

    expect(mockDeletePlaylist).toHaveBeenCalledWith(1);
  });

  it("does not delete playlist when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<PlaylistSidebar {...defaultProps} />);

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Rock Classics") });
    await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
    await user.click(screen.getByText("Delete"));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDeletePlaylist).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete Playlist")).not.toBeInTheDocument();
  });

  it("shows confirmation dialog when deleting a smart playlist", async () => {
    const user = userEvent.setup();
    render(<PlaylistSidebar {...defaultProps} />);

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Recently Added") });

    await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
    await user.click(screen.getByText("Delete"));

    expect(screen.getByText("Delete Smart Playlist")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete "Recently Added"/)).toBeInTheDocument();
  });

  it("does not delete smart playlist until confirmed", async () => {
    const user = userEvent.setup();
    render(<PlaylistSidebar {...defaultProps} />);

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Recently Added") });
    await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
    await user.click(screen.getByText("Delete"));

    expect(mockDeleteSmartPlaylist).not.toHaveBeenCalled();

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    const confirmBtn = deleteButtons[deleteButtons.length - 1];
    await user.click(confirmBtn);

    expect(mockDeleteSmartPlaylist).toHaveBeenCalledWith(10);
  });
});
