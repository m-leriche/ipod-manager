import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ArtistPicker } from "./ArtistPicker";
import type { ArtistSummary } from "../../../types/library";

const artists: ArtistSummary[] = [
  { name: "Aphex Twin", track_count: 30, album_count: 4 },
  { name: "Boards of Canada", track_count: 25, album_count: 3 },
  { name: "Radiohead", track_count: 80, album_count: 9 },
];

describe("ArtistPicker", () => {
  it("shows 'All Artists' when nothing selected", () => {
    render(<ArtistPicker artists={artists} selectedArtist={null} onSelectArtist={vi.fn()} />);
    expect(screen.getByText("All Artists")).toBeInTheDocument();
  });

  it("shows selected artist name in trigger", () => {
    render(<ArtistPicker artists={artists} selectedArtist="Radiohead" onSelectArtist={vi.fn()} />);
    expect(screen.getByText("Radiohead")).toBeInTheDocument();
  });

  it("opens dropdown on click and shows all artists", () => {
    render(<ArtistPicker artists={artists} selectedArtist={null} onSelectArtist={vi.fn()} />);
    fireEvent.click(screen.getByText("All Artists"));
    expect(screen.getByText("Aphex Twin")).toBeInTheDocument();
    expect(screen.getByText("Boards of Canada")).toBeInTheDocument();
    expect(screen.getByText("Radiohead")).toBeInTheDocument();
  });

  it("calls onSelectArtist with name when artist clicked", () => {
    const onSelect = vi.fn();
    render(<ArtistPicker artists={artists} selectedArtist={null} onSelectArtist={onSelect} />);
    fireEvent.click(screen.getByText("All Artists"));
    fireEvent.click(screen.getByText("Boards of Canada"));
    expect(onSelect).toHaveBeenCalledWith("Boards of Canada");
  });

  it("calls onSelectArtist with null when 'All Artists' clicked in dropdown", () => {
    const onSelect = vi.fn();
    render(<ArtistPicker artists={artists} selectedArtist="Radiohead" onSelectArtist={onSelect} />);
    fireEvent.click(screen.getByText("Radiohead"));
    // "All Artists" appears in the dropdown
    const allArtistsOption = screen.getAllByText("All Artists")[0];
    fireEvent.click(allArtistsOption);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("shows album count for each artist", () => {
    render(<ArtistPicker artists={artists} selectedArtist={null} onSelectArtist={vi.fn()} />);
    fireEvent.click(screen.getByText("All Artists"));
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });
});
