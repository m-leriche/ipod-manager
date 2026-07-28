import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtworkCarousel } from "./ArtworkCarousel";
import { getSetting, setSetting } from "../../../utils/settings";
import type { AlbumSummary } from "../../../types/library";

vi.mock("../../../contexts/ArtCacheContext", () => ({
  useArtCache: () => ({ artCacheBust: 0, bumpArtCache: vi.fn() }),
}));

const makeAlbum = (name: string, artist = "Artist", folderPath = `/music/${name}`): AlbumSummary => ({
  name,
  artist,
  year: 2024,
  track_count: 10,
  folder_path: folderPath,
});

const albums: AlbumSummary[] = [
  makeAlbum("Alpha"),
  makeAlbum("Beta"),
  makeAlbum("Gamma"),
  makeAlbum("Delta"),
  makeAlbum("Epsilon"),
];

// 15 albums so render culling has something to cull at every density
const manyAlbums: AlbumSummary[] = "ABCDEFGHIJKLMNO".split("").map((letter) => makeAlbum(letter));

const renderedCovers = (container: HTMLElement) => container.querySelectorAll("[data-idx]").length;

describe("ArtworkCarousel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows empty state when no albums", () => {
    render(<ArtworkCarousel albums={[]} selectedAlbum={null} onSelectAlbum={vi.fn()} onPlayAlbum={vi.fn()} />);
    expect(screen.getByText("No albums in library")).toBeInTheDocument();
  });

  it("renders centered album info", () => {
    render(<ArtworkCarousel albums={albums} selectedAlbum="Gamma" onSelectAlbum={vi.fn()} onPlayAlbum={vi.fn()} />);
    expect(screen.getByText(/Artist - Gamma/)).toBeInTheDocument();
    expect(screen.getByText(/· 2024/)).toBeInTheDocument();
  });

  it("calls onSelectAlbum when clicking a side album", () => {
    const onSelect = vi.fn();
    // Delta is index 2 in sorted order (Alpha, Beta, Delta, Epsilon, Gamma)
    render(<ArtworkCarousel albums={albums} selectedAlbum="Delta" onSelectAlbum={onSelect} onPlayAlbum={vi.fn()} />);
    // Beta is at offset -1 from Delta, click it
    const betaImg = screen.getByAltText("Beta");
    fireEvent.click(betaImg.closest("div[class*='absolute']")!);
    expect(onSelect).toHaveBeenCalledWith("Beta");
  });

  it("does not fire onSelectAlbum when clicking the center album (only navigates non-center)", () => {
    const onSelect = vi.fn();
    render(<ArtworkCarousel albums={albums} selectedAlbum="Gamma" onSelectAlbum={onSelect} onPlayAlbum={vi.fn()} />);
    const gammaImg = screen.getByAltText("Gamma");
    fireEvent.click(gammaImg.closest("div[class*='absolute']")!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onPlayAlbum on double-click of center album", () => {
    const onPlay = vi.fn();
    render(<ArtworkCarousel albums={albums} selectedAlbum="Gamma" onSelectAlbum={vi.fn()} onPlayAlbum={onPlay} />);
    const gammaImg = screen.getByAltText("Gamma");
    fireEvent.doubleClick(gammaImg.closest("div[class*='absolute']")!);
    expect(onPlay).toHaveBeenCalledWith("Gamma");
  });

  it("only renders albums within visible range", () => {
    // Delta is index 2 in sorted order, visible range +-2 covers all 5
    render(<ArtworkCarousel albums={albums} selectedAlbum="Delta" onSelectAlbum={vi.fn()} onPlayAlbum={vi.fn()} />);
    expect(screen.getByAltText("Alpha")).toBeInTheDocument();
    expect(screen.getByAltText("Gamma")).toBeInTheDocument();
  });

  it("defaults to first album when no selection and no playback", () => {
    render(<ArtworkCarousel albums={albums} selectedAlbum={null} onSelectAlbum={vi.fn()} onPlayAlbum={vi.fn()} />);
    // First album should be shown as centered (its name appears in the info area)
    expect(screen.getByText(/Artist - Alpha/)).toBeInTheDocument();
  });

  it("dismisses lyrics overlay when clicking a side album", () => {
    const onDismiss = vi.fn();
    render(
      <ArtworkCarousel
        albums={albums}
        selectedAlbum="Delta"
        onSelectAlbum={vi.fn()}
        onPlayAlbum={vi.fn()}
        lyricsOverlay
        onLyricsOverlayDismiss={onDismiss}
      />,
    );
    const betaImg = screen.getByAltText("Beta");
    fireEvent.click(betaImg.closest("div[class*='absolute']")!);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not dismiss lyrics overlay when clicking center album", () => {
    const onDismiss = vi.fn();
    render(
      <ArtworkCarousel
        albums={albums}
        selectedAlbum="Delta"
        onSelectAlbum={vi.fn()}
        onPlayAlbum={vi.fn()}
        lyricsOverlay
        onLyricsOverlayDismiss={onDismiss}
      />,
    );
    const deltaImg = screen.getByAltText("Delta");
    fireEvent.click(deltaImg.closest("div[class*='absolute']")!);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  describe("density", () => {
    it("renders center + 3 per side + exit slots by default", () => {
      const { container } = render(
        <ArtworkCarousel albums={manyAlbums} selectedAlbum="H" onSelectAlbum={vi.fn()} onPlayAlbum={vi.fn()} />,
      );
      expect(renderedCovers(container)).toBe(2 * (3 + 1) + 1);
    });

    it("renders more covers when a larger density is stored", () => {
      setSetting("coverFlowSideCount", 6);
      const { container } = render(
        <ArtworkCarousel albums={manyAlbums} selectedAlbum="H" onSelectAlbum={vi.fn()} onPlayAlbum={vi.fn()} />,
      );
      expect(renderedCovers(container)).toBe(2 * (6 + 1) + 1);
    });

    it("updates the rendered covers and persists the setting when stepping density", () => {
      const { container } = render(
        <ArtworkCarousel albums={manyAlbums} selectedAlbum="H" onSelectAlbum={vi.fn()} onPlayAlbum={vi.fn()} />,
      );
      expect(screen.getByLabelText("Visible covers")).toHaveTextContent("7");

      fireEvent.click(screen.getByLabelText("More covers"));

      expect(screen.getByLabelText("Visible covers")).toHaveTextContent("9");
      expect(renderedCovers(container)).toBe(2 * (4 + 1) + 1);
      expect(getSetting("coverFlowSideCount")).toBe(4);
    });
  });
});
