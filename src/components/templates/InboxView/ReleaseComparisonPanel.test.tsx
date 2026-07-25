import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ReleaseComparisonPanel } from "./ReleaseComparisonPanel";
import type { InboxAlbum, InboxTrack, ReleaseComparison } from "./types";

const mockInvoke = vi.mocked(invoke);

const track = (track_number: number, title: string): InboxTrack => ({
  file_path: `/inbox/Melted/0${track_number}.flac`,
  file_name: `0${track_number}.flac`,
  title,
  track_number,
  disc_number: 1,
  duration_secs: 180,
  format: "FLAC",
  bitrate_kbps: null,
  sample_rate: 44100,
  bit_depth: 16,
});

const album: InboxAlbum = {
  folder_path: "/inbox/Melted",
  folder_name: "Melted",
  artist: "Ty Segall",
  album: "Melted",
  year: 2010,
  tracks: [track(1, "Finger"), track(2, "Caesar")],
  checks: {
    tags: { status: "pass", detail: null },
    cover: { status: "pass", detail: null },
    tracklist: { status: "fail", detail: "2 tracks here vs 3 on “Melted”" },
    duplicate: { status: "pass", detail: null },
  },
};

const comparison: ReleaseComparison = {
  query_artist: "Ty Segall",
  query_album: "Melted",
  detail: {
    release: {
      id: "r1",
      title: "Melted",
      artist: "Ty Segall",
      date: "2010-04-27",
      disambiguation: null,
      track_count: 3,
      score: 100,
    },
    media: [{ position: 1, format: "Vinyl", track_count: 3 }],
    tracks: [
      { position: 1, disc_number: 1, title: "Finger", artist: "Ty Segall", length_ms: 180000 },
      { position: 2, disc_number: 1, title: "Caesar", artist: "Ty Segall", length_ms: 180000 },
      { position: 3, disc_number: 1, title: "Sad Fuzz", artist: "Ty Segall", length_ms: 141000 },
    ],
  },
  alternatives: [
    {
      id: "r2",
      title: "Melted",
      artist: "Ty Segall",
      date: "2010",
      disambiguation: "reissue",
      track_count: 12,
      score: 90,
    },
  ],
};

describe("ReleaseComparisonPanel", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("shows the release it compared against", async () => {
    mockInvoke.mockResolvedValue(comparison);
    render(<ReleaseComparisonPanel album={album} />);

    expect(await screen.findByText("Melted")).toBeInTheDocument();
    expect(screen.getByText("Ty Segall · 2010 · Vinyl · 3 tracks")).toBeInTheDocument();
    expect(screen.getByText("Compared against")).toBeInTheDocument();
  });

  it("lists both sides of the comparison, including the track only MusicBrainz has", async () => {
    mockInvoke.mockResolvedValue(comparison);
    render(<ReleaseComparisonPanel album={album} />);

    // One list — the release tracklist — not two parallel columns.
    expect(await screen.findByText("Sad Fuzz")).toBeInTheDocument();
    expect(screen.getAllByText("Finger")).toHaveLength(1);
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
  });

  it("explains why the counts differ", async () => {
    mockInvoke.mockResolvedValue(comparison);
    render(<ReleaseComparisonPanel album={album} />);

    expect(await screen.findByText("Missing 1 of 3 tracks.")).toBeInTheDocument();
  });

  it("shows the query that produced the match", async () => {
    mockInvoke.mockResolvedValue(comparison);
    render(<ReleaseComparisonPanel album={album} />);

    expect(await screen.findByText(/Searched “Ty Segall – Melted”/)).toBeInTheDocument();
  });

  it("passes the album details to the lookup", async () => {
    mockInvoke.mockResolvedValue(comparison);
    render(<ReleaseComparisonPanel album={album} />);

    await screen.findByText("Melted");
    expect(mockInvoke).toHaveBeenCalledWith("compare_inbox_release", {
      artist: "Ty Segall",
      album: "Melted",
      trackCount: 2,
      mbid: null,
    });
  });

  it("re-runs the lookup against a chosen alternative release", async () => {
    mockInvoke.mockResolvedValue(comparison);
    render(<ReleaseComparisonPanel album={album} />);

    fireEvent.change(await screen.findByTestId("alternative-release"), { target: { value: "r2" } });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenLastCalledWith("compare_inbox_release", {
        artist: "Ty Segall",
        album: "Melted",
        trackCount: 2,
        mbid: "r2",
      }),
    );
  });

  it("surfaces a lookup failure with a retry", async () => {
    mockInvoke.mockRejectedValue("No MusicBrainz release found");
    render(<ReleaseComparisonPanel album={album} />);

    expect(await screen.findByText(/No MusicBrainz release found/)).toBeInTheDocument();

    mockInvoke.mockResolvedValue(comparison);
    fireEvent.click(screen.getByText("Retry"));

    expect(await screen.findByText("Melted")).toBeInTheDocument();
  });

  it("separates files that are not on the release", async () => {
    mockInvoke.mockResolvedValue({
      ...comparison,
      detail: {
        ...comparison.detail,
        release: { ...comparison.detail.release, track_count: 1 },
        media: [{ position: 1, format: "Vinyl", track_count: 1 }],
        tracks: [comparison.detail.tracks[0]],
      },
    } satisfies ReleaseComparison);
    render(<ReleaseComparisonPanel album={album} />);

    expect(await screen.findByText("Not on this release")).toBeInTheDocument();
    expect(screen.getByText("Caesar")).toBeInTheDocument();
  });

  it("labels each disc when the release spans more than one", async () => {
    mockInvoke.mockResolvedValue({
      ...comparison,
      detail: {
        ...comparison.detail,
        media: [
          { position: 1, format: "CD", track_count: 2 },
          { position: 2, format: "CD", track_count: 1 },
        ],
        tracks: [
          { position: 1, disc_number: 1, title: "Finger", artist: "Ty Segall", length_ms: 180000 },
          { position: 2, disc_number: 1, title: "Caesar", artist: "Ty Segall", length_ms: 180000 },
          { position: 1, disc_number: 2, title: "Sad Fuzz", artist: "Ty Segall", length_ms: 141000 },
        ],
      },
    } satisfies ReleaseComparison);
    render(<ReleaseComparisonPanel album={album} />);

    expect(await screen.findByText("Disc 1")).toBeInTheDocument();
    expect(screen.getByText("Disc 2")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your 2 tracks match disc 1 of this 2-disc release. The other disc may be in a separate folder.",
      ),
    ).toBeInTheDocument();
  });
});
