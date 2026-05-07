import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewReleasesModal } from "./NewReleasesModal";
import type { DiscoveredRelease, WatchedArtist, NewReleasesCheckResult } from "../../../types/releases";

const mockUseNewReleases = {
  checkState: { active: false, totalArtists: 0, completedArtists: 0, currentArtist: "", phase: "" },
  releases: [] as DiscoveredRelease[],
  watchedArtists: [] as WatchedArtist[],
  newReleaseCount: 0,
  startCheck: vi.fn(),
  cancelCheck: vi.fn(),
  watchArtist: vi.fn(),
  unwatchArtist: vi.fn(),
  isWatched: vi.fn(() => false),
  dismissRelease: vi.fn(),
  refreshReleases: vi.fn(),
  refreshWatchedArtists: vi.fn(),
  lastResult: null as NewReleasesCheckResult | null,
  clearResult: vi.fn(),
};

vi.mock("../../../contexts/NewReleasesContext", () => ({
  useNewReleases: () => mockUseNewReleases,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("NewReleasesModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNewReleases.releases = [];
    mockUseNewReleases.watchedArtists = [];
    mockUseNewReleases.checkState = {
      active: false,
      totalArtists: 0,
      completedArtists: 0,
      currentArtist: "",
      phase: "",
    };
  });

  it("renders empty state", () => {
    render(<NewReleasesModal onClose={onClose} />);
    expect(screen.getByText("New Releases")).toBeInTheDocument();
    expect(screen.getByText("No new releases found.")).toBeInTheDocument();
  });

  it("renders releases grouped by artist", () => {
    mockUseNewReleases.releases = [
      {
        id: 1,
        watched_artist_id: 1,
        mb_release_group_id: "rg-1",
        title: "Album One",
        artist_name: "Artist A",
        release_type: "Album",
        first_release_date: "2025-03-15",
        discovered_at: 0,
        dismissed: false,
        in_library: false,
      },
      {
        id: 2,
        watched_artist_id: 1,
        mb_release_group_id: "rg-2",
        title: "Single Two",
        artist_name: "Artist A",
        release_type: "Single",
        first_release_date: "2025-01-10",
        discovered_at: 0,
        dismissed: false,
        in_library: true,
      },
    ];

    render(<NewReleasesModal onClose={onClose} />);
    expect(screen.getByText("Artist A")).toBeInTheDocument();
    expect(screen.getByText("Album One")).toBeInTheDocument();
    expect(screen.getByText("Single Two")).toBeInTheDocument();
    expect(screen.getByText("In Library")).toBeInTheDocument();
  });

  it("calls startCheck when Check Now is clicked", () => {
    mockUseNewReleases.watchedArtists = [
      {
        id: 1,
        name: "Test",
        mb_artist_id: null,
        mb_artist_name: null,
        match_status: "pending" as const,
        created_at: 0,
        last_checked_at: 0,
      },
    ];

    render(<NewReleasesModal onClose={onClose} />);
    fireEvent.click(screen.getByText("Check Now"));
    expect(mockUseNewReleases.startCheck).toHaveBeenCalled();
  });

  it("shows progress bar when checking", () => {
    mockUseNewReleases.checkState = {
      active: true,
      totalArtists: 10,
      completedArtists: 3,
      currentArtist: "Radiohead",
      phase: "fetching_releases",
    };

    render(<NewReleasesModal onClose={onClose} />);
    expect(screen.getByText(/Radiohead/)).toBeInTheDocument();
    expect(screen.getByText("3/10")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    render(<NewReleasesModal onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to Artists tab", () => {
    render(<NewReleasesModal onClose={onClose} />);
    fireEvent.click(screen.getByText("Watched Artists"));
    expect(screen.getByText("No watched artists yet.")).toBeInTheDocument();
  });
});
