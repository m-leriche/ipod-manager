import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LibraryPlayer } from "./LibraryPlayer";

// Mock sub-components to isolate LibraryPlayer logic
vi.mock("../../organisms/AlbumGrid/AlbumGrid", () => ({
  AlbumGrid: () => <div data-testid="album-grid" />,
}));
vi.mock("../../organisms/ArtworkCarousel/ArtworkCarousel", () => ({
  ArtworkCarousel: () => <div data-testid="artwork-carousel" />,
}));
vi.mock("../../organisms/AlbumGrid/useResizableHeight", () => ({
  useResizableHeight: () => ({
    containerRef: { current: null },
    fraction: 0.4,
    onDragStart: vi.fn(),
  }),
}));
vi.mock("../../organisms/ColumnBrowser/ColumnBrowser", () => ({
  ColumnBrowser: () => <div data-testid="column-browser" />,
}));
vi.mock("../../organisms/TrackTable/TrackTable", () => ({
  TrackTable: () => <div data-testid="track-table" />,
}));
vi.mock("../../organisms/TrackDetailPanel/TrackDetailPanel", () => ({
  TrackDetailPanel: () => <div data-testid="detail-panel" />,
}));
vi.mock("../LibraryStats/LibraryStats", () => ({
  LibraryStats: () => <div data-testid="library-stats" />,
}));
vi.mock("./PlaylistSidebar", () => ({
  PlaylistSidebar: () => <div data-testid="playlist-sidebar" />,
}));
vi.mock("../../organisms/SmartPlaylistEditor/SmartPlaylistEditor", () => ({
  SmartPlaylistEditor: () => <div data-testid="smart-playlist-editor" />,
}));
vi.mock("./LibraryStatusBar", () => ({
  LibraryStatusBar: () => <div data-testid="status-bar" />,
}));
vi.mock("./LibraryToolbar", () => ({
  LibraryToolbar: () => <div data-testid="library-toolbar" />,
}));
vi.mock("../../atoms/Skeleton/Skeleton", () => ({
  LibraryLoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

vi.mock("../../../contexts/BackgroundArtRepairContext", () => ({
  useBackgroundArtRepair: () => ({
    state: { active: false, total: 0, completed: 0, currentItem: "" },
    start: vi.fn(),
    cancel: vi.fn(),
  }),
}));
vi.mock("../../../contexts/BackgroundLyricsContext", () => ({
  useBackgroundLyrics: () => ({
    state: { active: false, total: 0, completed: 0, currentItem: "" },
    start: vi.fn(),
    cancel: vi.fn(),
  }),
}));

// Mock the data/actions hooks
const mockLibraryData = {
  hasLibrary: true,
  dataLoaded: true,
  tracks: [],
  displayedTracks: [],
  totalTrackCount: 0,
  libraryPath: "/music",
  search: "",
  setSearch: vi.fn(),
  flaggedOnly: false,
  toggleFlaggedOnly: vi.fn(),
  isBackgroundScanning: false,
  sortBy: "artist",
  sortDirection: "asc" as const,
  handleSort: vi.fn(),
  handleSelectionChange: vi.fn(),
  selectedTracks: [],
  fetchBrowserData: vi.fn(),
  onImportComplete: vi.fn(),
  searchInputRef: { current: null },
  genreList: [],
  artistList: [],
  albumList: [],
  selectedGenres: new Set<string>(),
  selectedArtists: new Set<string>(),
  selectedAlbums: new Set<string>(),
  handleSelectGenre: vi.fn(),
  handleSelectArtist: vi.fn(),
  handleSelectAlbum: vi.fn(),
  handlePlayColumn: vi.fn(),
  albumSortMode: "alpha" as const,
  handleAlbumSortModeChange: vi.fn(),
  loadMoreTracks: vi.fn(),
};

vi.mock("./useLibraryData", () => ({
  useLibraryData: () => mockLibraryData,
}));

vi.mock("./useLibraryActions", () => ({
  useLibraryActions: () => ({
    handleColumnPlayAll: vi.fn(),
    handleColumnAddToQueue: vi.fn(),
    handleColumnAddToPlaylist: vi.fn(),
    handleFlagTracks: vi.fn(),
    handleRateTracks: vi.fn(),
    handleRepairAlbumArt: vi.fn(),
    handleFixAlbumArtForAlbum: vi.fn(),
    handleUploadAlbumArt: vi.fn(),
    handleFetchLyrics: vi.fn(),
    handleRemoveLyrics: vi.fn(),
  }),
}));

vi.mock("./useLibraryImport", () => ({
  useLibraryImport: () => ({
    isDragOver: false,
    handleChooseLibrary: vi.fn(),
  }),
}));

const defaultProps = {
  showColumnBrowser: false,
  showInfoPanel: false,
  showStatsPanel: false,
  showPlaylistSidebar: false,
};

describe("LibraryPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLibraryData.hasLibrary = true;
    mockLibraryData.dataLoaded = true;
  });

  it("renders empty state when no library exists", () => {
    mockLibraryData.hasLibrary = false;
    render(<LibraryPlayer {...defaultProps} />);
    expect(screen.getByText("Add your music library")).toBeInTheDocument();
    expect(screen.getByText("Choose Folder")).toBeInTheDocument();
  });

  it("renders loading skeleton when data is not loaded", () => {
    mockLibraryData.dataLoaded = false;
    render(<LibraryPlayer {...defaultProps} />);
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("renders toolbar and track table when library is loaded", () => {
    render(<LibraryPlayer {...defaultProps} />);
    expect(screen.getByTestId("library-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("track-table")).toBeInTheDocument();
    expect(screen.getByTestId("status-bar")).toBeInTheDocument();
  });

  it("shows column browser when showColumnBrowser is true", () => {
    render(<LibraryPlayer {...defaultProps} showColumnBrowser />);
    expect(screen.getByTestId("column-browser")).toBeInTheDocument();
  });

  it("shows album grid when showAlbumGrid is true", () => {
    render(<LibraryPlayer {...defaultProps} showAlbumGrid />);
    expect(screen.getByTestId("album-grid")).toBeInTheDocument();
  });

  it("shows artwork carousel when showArtworkCarousel is true", () => {
    render(<LibraryPlayer {...defaultProps} showArtworkCarousel />);
    expect(screen.getByTestId("artwork-carousel")).toBeInTheDocument();
  });

  it("shows playlist sidebar when showPlaylistSidebar is true", () => {
    render(<LibraryPlayer {...defaultProps} showPlaylistSidebar />);
    expect(screen.getByTestId("playlist-sidebar")).toBeInTheDocument();
  });

  it("shows info panel when showInfoPanel is true", () => {
    render(<LibraryPlayer {...defaultProps} showInfoPanel />);
    expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
  });

  it("shows stats panel when showStatsPanel is true", () => {
    render(<LibraryPlayer {...defaultProps} showStatsPanel />);
    expect(screen.getByTestId("library-stats")).toBeInTheDocument();
  });

  it("does not show column browser by default", () => {
    render(<LibraryPlayer {...defaultProps} />);
    expect(screen.queryByTestId("column-browser")).not.toBeInTheDocument();
  });
});
