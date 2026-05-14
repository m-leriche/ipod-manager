import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { IpodArtRepairModal } from "./IpodArtRepairModal";
import type { AlbumInfo } from "../../../types/albumart";

vi.mock("../../../contexts/ArtCacheContext", () => ({
  useArtCache: () => ({ artCacheBust: 0, bumpArtCache: vi.fn() }),
}));

const mockAlbums: AlbumInfo[] = [
  {
    folder_path: "/Volumes/IPOD/Music/Artist1/Album1",
    folder_name: "Album1",
    artist: "Artist1",
    album: "Album1",
    track_count: 10,
    has_cover_file: true,
    has_embedded_art: true,
  },
  {
    folder_path: "/Volumes/IPOD/Music/Artist2/Album2",
    folder_name: "Album2",
    artist: "Artist2",
    album: "Album2",
    track_count: 8,
    has_cover_file: false,
    has_embedded_art: true,
  },
  {
    folder_path: "/Volumes/IPOD/Music/Artist3/Album3",
    folder_name: "Album3",
    artist: null,
    album: null,
    track_count: 5,
    has_cover_file: false,
    has_embedded_art: false,
  },
];

const onClose = vi.fn();

describe("IpodArtRepairModal", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockResolvedValue(() => {});
    onClose.mockReset();
  });

  it("shows scanning state initially", () => {
    vi.mocked(invoke).mockReturnValue(new Promise(() => {}));
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);
    expect(screen.getByText("Scanning iPod for albums...")).toBeInTheDocument();
  });

  it("shows summary after scan finds missing art", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockAlbums);
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument(); // total albums
    });
    expect(screen.getByText("2")).toBeInTheDocument(); // missing art
    expect(screen.getByText(/2 albums on your iPod are missing cover art/)).toBeInTheDocument();
    expect(screen.getByText("Fix All (2)")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("shows done state when all albums have art", async () => {
    const allHaveCover = mockAlbums.map((a) => ({ ...a, has_cover_file: true }));
    vi.mocked(invoke).mockResolvedValueOnce(allHaveCover);
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/All 3 albums on your iPod already have cover art/)).toBeInTheDocument();
    });
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("shows error state on scan failure", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("Path not found");
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Path not found")).toBeInTheDocument();
    });
  });

  it("transitions to review and shows missing albums", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockAlbums);
    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Review")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Review"));

    // Should only show albums missing covers
    expect(screen.getByText("Artist2 — Album2")).toBeInTheDocument();
    expect(screen.getByText("Unknown Artist — Album3")).toBeInTheDocument();
    expect(screen.queryByText("Artist1 — Album1")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });

  it("allows toggling album selection in review", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockAlbums);
    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Review"));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();

    // Uncheck first album
    await user.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
    expect(screen.getByText("Fix Selected (1)")).toBeInTheDocument();
  });

  it("can toggle all/none in review", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockAlbums);
    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Review"));

    await user.click(screen.getByText("Deselect All"));
    expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();
    expect(screen.getByText("Fix Selected (0)")).toBeInTheDocument();

    await user.click(screen.getByText("Select All"));
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });

  it("calls fix_album_art with correct folders on Fix All", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockAlbums) // scan
      .mockResolvedValueOnce({ total: 2, fixed: 1, already_ok: 0, failed: 1, cancelled: false, errors: [] }); // fix

    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Fix All (2)")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Fix All (2)"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("fix_album_art", {
        folders: ["/Volumes/IPOD/Music/Artist2/Album2", "/Volumes/IPOD/Music/Artist3/Album3"],
      });
    });

    // Shows results — verify the stat labels are present
    await waitFor(() => {
      expect(screen.getByText("Fixed")).toBeInTheDocument();
    });
    expect(screen.getByText("Not Found")).toBeInTheDocument();
    expect(screen.getByText("Already OK")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("calls fix_album_art with selected folders from review", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockAlbums) // scan
      .mockResolvedValueOnce({ total: 1, fixed: 1, already_ok: 0, failed: 0, cancelled: false, errors: [] }); // fix

    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Review"));

    // Deselect first missing album, keep only second
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    await user.click(screen.getByText("Fix Selected (1)"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("fix_album_art", {
        folders: ["/Volumes/IPOD/Music/Artist3/Album3"],
      });
    });
  });

  it("disables Fix Selected when none selected", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockAlbums);
    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Review"));
    await user.click(screen.getByText("Deselect All"));

    expect(screen.getByText("Fix Selected (0)")).toBeDisabled();
  });

  it("can navigate back from review to summary", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockAlbums);
    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Review"));
    expect(screen.getByText("Fix Selected (2)")).toBeInTheDocument();

    await user.click(screen.getByText("Back"));
    expect(screen.getByText("Fix All (2)")).toBeInTheDocument();
  });

  it("calls onClose when Close is clicked in done state", async () => {
    const allHaveCover = mockAlbums.map((a) => ({ ...a, has_cover_file: true }));
    vi.mocked(invoke).mockResolvedValueOnce(allHaveCover);
    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Close")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows has embedded art hint in review", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockAlbums);
    const user = userEvent.setup();
    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Review"));

    // Album2 has embedded art
    expect(screen.getByText(/has embedded art/)).toBeInTheDocument();
  });

  it("listens to scan and fix progress events", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockAlbums)
      .mockResolvedValueOnce({ total: 2, fixed: 2, already_ok: 0, failed: 0, cancelled: false, errors: [] });

    render(<IpodArtRepairModal musicPath="/Volumes/IPOD/Music" onClose={onClose} />);

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith("albumart-scan-progress", expect.any(Function));
    });

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText("Fix All (2)")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Fix All (2)"));

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith("albumart-progress", expect.any(Function));
    });
  });
});
