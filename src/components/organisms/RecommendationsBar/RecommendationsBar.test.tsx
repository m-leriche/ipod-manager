import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { RecommendationsBar } from "./RecommendationsBar";
import type { TrackRecommendation } from "./types";

const addTracks = vi.fn();

vi.mock("../../../contexts/PlaylistContext", () => ({
  usePlaylist: () => ({ addTracks }),
}));

// AlbumArtwork (used for owned recommendations) reads the art cache.
vi.mock("../../../contexts/ArtCacheContext", () => ({
  useArtCache: () => ({ artCacheBust: 0, bumpArtCache: vi.fn() }),
}));

const mockInvoke = vi.mocked(invoke);

const rec = (over: Partial<TrackRecommendation>): TrackRecommendation => ({
  title: "Song",
  artist: "Artist",
  album: null,
  image_url: null,
  folder_path: null,
  in_library: true,
  track_id: 1,
  score: 0.9,
  ...over,
});

describe("RecommendationsBar", () => {
  beforeEach(() => {
    addTracks.mockReset();
    mockInvoke.mockReset();
  });

  it("renders nothing when no playlist is active", () => {
    const { container } = render(<RecommendationsBar playlistId={null} smartPlaylistId={null} refreshKey="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("fetches and renders recommendations for a regular playlist", async () => {
    mockInvoke.mockResolvedValueOnce([
      rec({ title: "Owned", track_id: 5, in_library: true }),
      rec({ title: "Discovery", track_id: null, in_library: false, artist: "New Band" }),
    ]);

    render(<RecommendationsBar playlistId={7} smartPlaylistId={null} refreshKey="a" />);

    expect(await screen.findByText("Owned")).toBeInTheDocument();
    expect(screen.getByText("Discovery")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get_playlist_recommendations", {
      playlistId: 7,
      smartPlaylistId: null,
    });
    // Owned track is addable; un-owned shows a "New" badge instead.
    expect(screen.getByLabelText("Add Owned to playlist")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("adds an owned track and removes it from the list", async () => {
    addTracks.mockResolvedValueOnce(undefined);
    mockInvoke.mockResolvedValueOnce([rec({ title: "Owned", track_id: 5 })]);

    render(<RecommendationsBar playlistId={7} smartPlaylistId={null} refreshKey="a" />);

    const addBtn = await screen.findByLabelText("Add Owned to playlist");
    fireEvent.click(addBtn);

    await waitFor(() => expect(addTracks).toHaveBeenCalledWith(7, [5]));
    await waitFor(() => expect(screen.queryByText("Owned")).not.toBeInTheDocument());
  });

  it("does not show add buttons for smart playlists", async () => {
    mockInvoke.mockResolvedValueOnce([rec({ title: "InLib", track_id: 5, in_library: true })]);

    render(<RecommendationsBar playlistId={null} smartPlaylistId={3} refreshKey="a" />);

    expect(await screen.findByText("InLib")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add InLib to playlist")).not.toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get_playlist_recommendations", {
      playlistId: null,
      smartPlaylistId: 3,
    });
  });

  it("shows an error message when the fetch fails", async () => {
    mockInvoke.mockRejectedValueOnce("boom");

    render(<RecommendationsBar playlistId={7} smartPlaylistId={null} refreshKey="a" />);

    expect(await screen.findByText("Couldn't load recommendations.")).toBeInTheDocument();
  });

  it("dismisses a card and reveals the next reserve item", async () => {
    // 13 results: only the first 12 are visible; #13 is held in reserve.
    const recs = Array.from({ length: 13 }, (_, i) =>
      rec({ title: `Song ${i + 1}`, artist: `Artist ${i + 1}`, track_id: null, in_library: false }),
    );
    mockInvoke.mockResolvedValueOnce(recs);

    render(<RecommendationsBar playlistId={7} smartPlaylistId={null} refreshKey="a" />);

    expect(await screen.findByText("Song 1")).toBeInTheDocument();
    expect(screen.queryByText("Song 13")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss Song 1"));

    await waitFor(() => expect(screen.queryByText("Song 1")).not.toBeInTheDocument());
    // Reserve item slides into the visible window.
    expect(screen.getByText("Song 13")).toBeInTheDocument();
  });

  it("refetches when Refresh is clicked", async () => {
    mockInvoke.mockResolvedValueOnce([rec({ title: "First", track_id: null, in_library: false })]);

    render(<RecommendationsBar playlistId={7} smartPlaylistId={null} refreshKey="a" />);
    expect(await screen.findByText("First")).toBeInTheDocument();

    mockInvoke.mockResolvedValueOnce([rec({ title: "Second", track_id: null, in_library: false })]);
    fireEvent.click(screen.getByTitle("Refresh recommendations"));

    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
