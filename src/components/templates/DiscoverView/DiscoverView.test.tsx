import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DiscoverView } from "./DiscoverView";
import type { DiscoverSection, DiscoverAlbum } from "./types";

const mockInvoke = vi.mocked(invoke);

const MOCK_ALBUM: DiscoverAlbum = {
  name: "OK Computer",
  artist_name: "Radiohead",
  image_url: "https://example.com/art.jpg",
  listeners: 1500000,
  url: "https://last.fm/music/Radiohead/OK+Computer",
};

const MOCK_SECTIONS: DiscoverSection[] = [
  {
    seed_artist: "Boards of Canada",
    albums: [
      MOCK_ALBUM,
      { ...MOCK_ALBUM, name: "Kid A", artist_name: "Radiohead" },
      { ...MOCK_ALBUM, name: "Mezzanine", artist_name: "Massive Attack" },
    ],
  },
  {
    seed_artist: "Aphex Twin",
    albums: [{ ...MOCK_ALBUM, name: "Geogaddi", artist_name: "Autechre" }],
  },
];

const MOCK_GENRES = [
  { name: "Electronic", track_count: 100 },
  { name: "Rock", track_count: 80 },
  { name: "Ambient", track_count: 50 },
  { name: "Hip-Hop", track_count: 30 },
];

const MOCK_TAG_ALBUMS: DiscoverAlbum[] = [
  { ...MOCK_ALBUM, name: "Music Has the Right to Children", artist_name: "BoC" },
  { ...MOCK_ALBUM, name: "Selected Ambient Works", artist_name: "RDJ" },
];

const MOCK_SEARCH_SECTION: DiscoverSection = {
  seed_artist: "Bruce Springsteen",
  albums: [
    { ...MOCK_ALBUM, name: "Born in the U.S.A.", artist_name: "John Mellencamp" },
    { ...MOCK_ALBUM, name: "The River", artist_name: "Tom Petty" },
  ],
};

beforeEach(() => {
  mockInvoke.mockReset();
});

const setupMocks = (sections = MOCK_SECTIONS, genres = MOCK_GENRES) => {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "get_discover_feed") return sections;
    if (cmd === "refresh_discover_feed") return sections;
    if (cmd === "get_library_genres") return genres;
    if (cmd === "get_discover_tag_albums") return MOCK_TAG_ALBUMS;
    if (cmd === "search_discover") return MOCK_SEARCH_SECTION;
    return undefined;
  });
};

describe("DiscoverView", () => {
  it("shows skeleton loading state initially", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<DiscoverView />);
    expect(screen.getByTestId("skeleton-feed")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders feed sections after loading", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Boards of Canada")).toBeInTheDocument();
    });

    expect(screen.getByText("OK Computer")).toBeInTheDocument();
    expect(screen.getByText("Kid A")).toBeInTheDocument();
    expect(screen.getByText("Mezzanine")).toBeInTheDocument();
    expect(screen.getByText("Aphex Twin")).toBeInTheDocument();
    expect(screen.getByText("Geogaddi")).toBeInTheDocument();
    expect(screen.getByText("Powered by Last.fm")).toBeInTheDocument();
  });

  it("renders 'Because you listen to' labels for each seed", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Boards of Canada")).toBeInTheDocument();
    });

    expect(screen.getByText("Aphex Twin")).toBeInTheDocument();
    const headings = screen.getAllByText(/Because you listen to/);
    expect(headings).toHaveLength(2);
  });

  it("shows empty state when no sections returned", async () => {
    setupMocks([], []);
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Add music to your library to get recommendations.")).toBeInTheDocument();
    });
  });

  it("shows error state and try again button", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_discover_feed") throw new Error("Network error");
      if (cmd === "get_library_genres") return [];
      return undefined;
    });

    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load recommendations.")).toBeInTheDocument();
    });

    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("renders genre tag pills", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Electronic")).toBeInTheDocument();
    });

    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.getByText("Ambient")).toBeInTheDocument();
    expect(screen.getByText("Hip-Hop")).toBeInTheDocument();
  });

  it("loads tag albums when genre pill clicked", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Electronic")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Electronic"));

    await waitFor(() => {
      expect(screen.getByText("Music Has the Right to Children")).toBeInTheDocument();
    });

    expect(mockInvoke).toHaveBeenCalledWith("get_discover_tag_albums", { tag: "Electronic", limit: 20 });
  });

  it("toggles tag off when clicking active tag", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Electronic")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Electronic"));
    await waitFor(() => {
      expect(screen.getByText("Music Has the Right to Children")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Electronic"));
    await waitFor(() => {
      expect(screen.queryByText("Music Has the Right to Children")).not.toBeInTheDocument();
    });
  });

  it("calls refresh_discover_feed with strategy when refresh clicked", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Refresh"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("refresh_discover_feed", { strategy: "random" });
    });
  });

  it("passes strategy when loading feed", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_discover_feed", { strategy: "random" });
    });
  });

  it("renders seed strategy dropdown", async () => {
    setupMocks();
    render(<DiscoverView />);

    const select = screen.getByDisplayValue("Random");
    expect(select).toBeInTheDocument();
  });

  it("renders search bar", () => {
    setupMocks();
    render(<DiscoverView />);
    expect(screen.getByPlaceholderText(/Search an artist or album/)).toBeInTheDocument();
  });

  it("searches and shows results above feed", async () => {
    setupMocks();
    render(<DiscoverView />);

    await waitFor(() => {
      expect(screen.getByText("Boards of Canada")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Search an artist or album/);
    fireEvent.change(input, { target: { value: "Bruce Springsteen" } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText("Bruce Springsteen")).toBeInTheDocument();
    });

    expect(mockInvoke).toHaveBeenCalledWith("search_discover", { query: "Bruce Springsteen" });
    expect(screen.getByText("Born in the U.S.A.")).toBeInTheDocument();
  });

  it("renders strategy dropdown and refresh controls", () => {
    setupMocks();
    render(<DiscoverView />);

    expect(screen.getByDisplayValue("Random")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search an artist or album/)).toBeInTheDocument();
  });
});
