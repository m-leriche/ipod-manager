import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewReleasesView } from "./NewReleasesView";
import { useNewReleases } from "../../../contexts/NewReleasesContext";

vi.mock("../../../contexts/NewReleasesContext");

const mockUseNewReleases = vi.mocked(useNewReleases);

const baseContext = {
  checkState: { active: false, totalArtists: 0, completedArtists: 0, currentArtist: "", phase: "" as const },
  releases: [],
  watchedArtists: [],
  artistsWithNewReleases: new Set<string>(),
  hasAnyNewReleases: false,
  lastResult: null,
  startCheck: vi.fn(),
  cancelCheck: vi.fn(),
  watchArtist: vi.fn(),
  unwatchArtist: vi.fn(),
  isWatched: () => false,
  hasNewReleases: () => false,
  dismissRelease: vi.fn(),
  refreshReleases: vi.fn(),
  refreshWatchedArtists: vi.fn(),
  clearResult: vi.fn(),
};

describe("NewReleasesView", () => {
  beforeEach(() => {
    mockUseNewReleases.mockReturnValue(baseContext);
  });

  it("renders empty state when no artists watched", () => {
    render(<NewReleasesView />);
    expect(screen.getByText("Add artists to start watching for new releases.")).toBeInTheDocument();
  });

  it("renders artist list with watched artists", () => {
    mockUseNewReleases.mockReturnValue({
      ...baseContext,
      watchedArtists: [
        {
          id: 1,
          name: "Radiohead",
          mb_artist_id: "abc",
          mb_artist_name: "Radiohead",
          match_status: "matched",
          created_at: 0,
          last_checked_at: 0,
        },
        {
          id: 2,
          name: "Bjork",
          mb_artist_id: "def",
          mb_artist_name: "Bjork",
          match_status: "matched",
          created_at: 0,
          last_checked_at: 0,
        },
      ],
    });
    render(<NewReleasesView />);
    expect(screen.getByText("Radiohead")).toBeInTheDocument();
    expect(screen.getByText("Bjork")).toBeInTheDocument();
    expect(screen.getByText("All Artists (2)")).toBeInTheDocument();
  });

  it("renders releases in table", () => {
    mockUseNewReleases.mockReturnValue({
      ...baseContext,
      watchedArtists: [
        {
          id: 1,
          name: "Radiohead",
          mb_artist_id: "abc",
          mb_artist_name: "Radiohead",
          match_status: "matched",
          created_at: 0,
          last_checked_at: 0,
        },
      ],
      releases: [
        {
          id: 1,
          watched_artist_id: 1,
          mb_release_group_id: "rg1",
          title: "Kid A",
          artist_name: "Radiohead",
          release_type: "Album",
          first_release_date: "2000-10-02",
          discovered_at: 0,
          dismissed: false,
          in_library: false,
        },
        {
          id: 2,
          watched_artist_id: 1,
          mb_release_group_id: "rg2",
          title: "Amnesiac",
          artist_name: "Radiohead",
          release_type: "Album",
          first_release_date: "2001-06-04",
          discovered_at: 0,
          dismissed: false,
          in_library: true,
        },
      ],
    });
    render(<NewReleasesView />);

    expect(screen.getByText("Kid A")).toBeInTheDocument();
    expect(screen.getByText("Amnesiac")).toBeInTheDocument();
    expect(screen.getByText("In Library")).toBeInTheDocument();
  });

  it("calls startCheck when Check Now clicked", () => {
    const startCheck = vi.fn();
    mockUseNewReleases.mockReturnValue({
      ...baseContext,
      watchedArtists: [
        {
          id: 1,
          name: "Test",
          mb_artist_id: null,
          mb_artist_name: null,
          match_status: "pending",
          created_at: 0,
          last_checked_at: 0,
        },
      ],
      startCheck,
    });
    render(<NewReleasesView />);

    fireEvent.click(screen.getByText("Check Now"));
    expect(startCheck).toHaveBeenCalled();
  });

  it("shows progress bar during check", () => {
    mockUseNewReleases.mockReturnValue({
      ...baseContext,
      checkState: {
        active: true,
        totalArtists: 10,
        completedArtists: 3,
        currentArtist: "Radiohead",
        phase: "fetching_releases",
      },
    });
    render(<NewReleasesView />);

    expect(screen.getByText("Checking...")).toBeInTheDocument();
  });

  it("shows status bar with release counts", () => {
    mockUseNewReleases.mockReturnValue({
      ...baseContext,
      watchedArtists: [
        {
          id: 1,
          name: "Radiohead",
          mb_artist_id: "abc",
          mb_artist_name: "Radiohead",
          match_status: "matched",
          created_at: 0,
          last_checked_at: 0,
        },
      ],
      releases: [
        {
          id: 1,
          watched_artist_id: 1,
          mb_release_group_id: "rg1",
          title: "Kid A",
          artist_name: "Radiohead",
          release_type: "Album",
          first_release_date: "2000-10-02",
          discovered_at: 0,
          dismissed: false,
          in_library: false,
        },
        {
          id: 2,
          watched_artist_id: 1,
          mb_release_group_id: "rg2",
          title: "Amnesiac",
          artist_name: "Radiohead",
          release_type: "Album",
          first_release_date: "2001-06-04",
          discovered_at: 0,
          dismissed: false,
          in_library: true,
        },
      ],
    });
    render(<NewReleasesView />);

    expect(screen.getByText("1 new, 1 in library")).toBeInTheDocument();
  });
});
