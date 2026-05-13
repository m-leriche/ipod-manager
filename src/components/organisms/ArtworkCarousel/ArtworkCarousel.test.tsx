import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtworkCarousel } from "./ArtworkCarousel";
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

describe("ArtworkCarousel", () => {
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
});
