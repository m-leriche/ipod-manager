import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewReleasesPopover } from "./NewReleasesPopover";
import { useNewReleases } from "../../../contexts/NewReleasesContext";

vi.mock("../../../contexts/NewReleasesContext");

const mockUseNewReleases = vi.mocked(useNewReleases);

const baseContext = {
  checkState: { active: false, totalArtists: 0, completedArtists: 0, currentArtist: "", phase: "" },
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

const makeAnchorRef = () => {
  const el = document.createElement("button");
  el.getBoundingClientRect = () => ({
    top: 50,
    bottom: 60,
    left: 100,
    right: 200,
    width: 100,
    height: 10,
    x: 100,
    y: 50,
    toJSON: () => ({}),
  });
  document.body.appendChild(el);
  return { current: el };
};

describe("NewReleasesPopover", () => {
  beforeEach(() => {
    mockUseNewReleases.mockReturnValue(baseContext);
  });

  it("renders empty state when no releases", () => {
    const anchorRef = makeAnchorRef();
    render(<NewReleasesPopover anchorRef={anchorRef} onClose={vi.fn()} />);
    expect(
      screen.getByText("No watched artists yet. Right-click an artist in the column browser to start watching."),
    ).toBeInTheDocument();
  });

  it("renders releases grouped by artist", () => {
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
    const anchorRef = makeAnchorRef();
    render(<NewReleasesPopover anchorRef={anchorRef} onClose={vi.fn()} />);

    expect(screen.getByText("Radiohead")).toBeInTheDocument();
    expect(screen.getByText("Kid A")).toBeInTheDocument();
    expect(screen.getByText("Amnesiac")).toBeInTheDocument();
    expect(screen.getByText("In Library")).toBeInTheDocument();
  });

  it("calls startCheck when Check Now clicked", () => {
    const startCheck = vi.fn();
    mockUseNewReleases.mockReturnValue({ ...baseContext, startCheck });
    const anchorRef = makeAnchorRef();
    render(<NewReleasesPopover anchorRef={anchorRef} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Check Now"));
    expect(startCheck).toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    const anchorRef = makeAnchorRef();
    render(<NewReleasesPopover anchorRef={anchorRef} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
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
    const anchorRef = makeAnchorRef();
    render(<NewReleasesPopover anchorRef={anchorRef} onClose={vi.fn()} />);

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText(/Checking Radiohead/)).toBeInTheDocument();
  });
});
