import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlbumArtManager } from "../components/AlbumArtManager";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
});

const ALBUMS = [
  { folder_path: "/music/Artist1/Album1", folder_name: "Album1", artist: "Artist1", album: "Album1", track_count: 10, has_cover_file: true, has_embedded_art: true },
  { folder_path: "/music/Artist2/Album2", folder_name: "Album2", artist: "Artist2", album: "Album2", track_count: 8, has_cover_file: false, has_embedded_art: true },
  { folder_path: "/music/Artist3/Album3", folder_name: "Album3", artist: "Artist3", album: "Album3", track_count: 12, has_cover_file: false, has_embedded_art: false },
];

describe("AlbumArtManager", () => {
  it("renders idle state with browse and scan buttons", () => {
    render(<AlbumArtManager />);
    expect(screen.getByText("Choose a music folder to scan for missing album art")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan for Missing Art" })).toBeInTheDocument();
  });

  it("shows 'No folder selected' when no path is set", () => {
    render(<AlbumArtManager />);
    expect(screen.getByText("No folder selected")).toBeInTheDocument();
  });

  it("disables scan button when no folder is selected", () => {
    render(<AlbumArtManager />);
    expect(screen.getByRole("button", { name: "Scan for Missing Art" })).toBeDisabled();
  });

  it("opens folder picker and triggers scan on browse", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(ALBUMS);

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Select music folder",
      });
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("scan_album_art", { path: "/music" });
    });
  });

  it("displays album stats after scanning", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(ALBUMS);

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("3 albums")).toBeInTheDocument();
      expect(screen.getByText("1 have art")).toBeInTheDocument();
      expect(screen.getByText("1 extractable")).toBeInTheDocument();
      expect(screen.getByText("1 missing")).toBeInTheDocument();
    });
  });

  it("displays album groups after scanning", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(ALBUMS);

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Embedded Art Available")).toBeInTheDocument();
      expect(screen.getByText("Missing Art")).toBeInTheDocument();
      expect(screen.getByText("Has Cover Art")).toBeInTheDocument();
    });
  });

  it("pre-selects albums without cover files", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(ALBUMS);

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      // Fix button should show 2 (the two albums without cover files)
      expect(screen.getByRole("button", { name: "Fix 2 Albums" })).toBeInTheDocument();
    });
  });

  it("shows error when scan fails", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/bad/path");
    mockInvoke.mockRejectedValue("Directory not found");

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Directory not found")).toBeInTheDocument();
    });
  });

  it("toggles album selection via checkbox", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(ALBUMS);

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Fix 2 Albums" })).toBeInTheDocument();
    });

    // Uncheck one album
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    expect(screen.getByRole("button", { name: "Fix 1 Albums" })).toBeInTheDocument();
  });

  it("select none deselects all albums", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(ALBUMS);

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Fix 2 Albums" })).toBeInTheDocument();
    });

    await user.click(screen.getByText("None"));
    expect(screen.getByRole("button", { name: "Fix 0 Albums" })).toBeDisabled();
  });

  it("calls fix_album_art with selected folders", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");

    // First call: scan. Subsequent: fix, then re-scan.
    mockInvoke
      .mockResolvedValueOnce(ALBUMS) // scan
      .mockResolvedValueOnce({ total: 2, fixed: 2, already_ok: 0, failed: 0, cancelled: false, errors: [] }) // fix
      .mockResolvedValueOnce(ALBUMS); // re-scan

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Fix 2 Albums" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Fix 2 Albums" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("fix_album_art", {
        folders: expect.arrayContaining(["/music/Artist2/Album2", "/music/Artist3/Album3"]),
      });
    });
  });

  it("shows result after fixing", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke
      .mockResolvedValueOnce(ALBUMS)
      .mockResolvedValueOnce({ total: 2, fixed: 2, already_ok: 0, failed: 0, cancelled: false, errors: [] })
      .mockResolvedValueOnce(ALBUMS);

    render(<AlbumArtManager />);
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Fix 2 Albums" }));

    await user.click(screen.getByRole("button", { name: "Fix 2 Albums" }));

    await waitFor(() => {
      expect(screen.getByText(/Fixed 2 albums/)).toBeInTheDocument();
    });
  });
});
