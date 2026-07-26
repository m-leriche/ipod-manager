import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InboxAlbumDetails } from "./InboxAlbumDetails";
import { CONVERT_TARGETS } from "./constants";
import type { InboxAlbum, InboxTrack } from "./types";

const track = (overrides: Partial<InboxTrack> = {}): InboxTrack => ({
  file_path: "/inbox/a/01.flac",
  file_name: "01.flac",
  title: "One",
  track_number: 1,
  disc_number: 1,
  duration_secs: 125,
  format: "FLAC",
  bitrate_kbps: null,
  sample_rate: 192000,
  bit_depth: 24,
  ...overrides,
});

const album = (tracks: InboxTrack[]): InboxAlbum => ({
  folder_path: "/inbox/a",
  folder_name: "a",
  artist: "Artist",
  album: "Album",
  year: null,
  tracks,
  checks: {
    tags: { status: "pass", detail: null },
    cover: { status: "pass", detail: null },
    tracklist: { status: "pass", detail: null },
    duplicate: { status: "pass", detail: null },
  },
});

describe("InboxAlbumDetails", () => {
  it("lists each track with its format details and duration", () => {
    const a = album([
      track(),
      track({
        file_path: "/inbox/a/02.mp3",
        file_name: "02.mp3",
        title: "Two",
        track_number: 2,
        duration_secs: 200,
        format: "MP3",
        bitrate_kbps: 320,
        sample_rate: 44100,
        bit_depth: null,
      }),
    ]);
    render(<InboxAlbumDetails album={a} disabled={false} onConvert={vi.fn()} />);

    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("FLAC · 24-bit · 192.0 kHz")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("MP3 · 44.1 kHz · 320 kbps")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("falls back to the file name when a track has no title", () => {
    render(<InboxAlbumDetails album={album([track({ title: null })])} disabled={false} onConvert={vi.fn()} />);
    expect(screen.getByText("01.flac")).toBeInTheDocument();
  });

  it("converts to the selected target", () => {
    const onConvert = vi.fn();
    const a = album([track()]);
    render(<InboxAlbumDetails album={a} disabled={false} onConvert={onConvert} />);

    fireEvent.change(screen.getByTestId("convert-target"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Convert" }));

    expect(onConvert).toHaveBeenCalledWith(a, CONVERT_TARGETS[4]);
    expect(CONVERT_TARGETS[4].target_format).toBe("mp3");
  });

  it("defaults to FLAC 16/44.1", () => {
    const onConvert = vi.fn();
    const a = album([track()]);
    render(<InboxAlbumDetails album={a} disabled={false} onConvert={onConvert} />);

    fireEvent.click(screen.getByRole("button", { name: "Convert" }));

    expect(onConvert).toHaveBeenCalledWith(
      a,
      expect.objectContaining({ target_format: "flac", sample_rate: 44100, bit_depth: 16 }),
    );
  });

  it("disables the controls while busy", () => {
    render(<InboxAlbumDetails album={album([track()])} disabled onConvert={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Convert" })).toBeDisabled();
    expect(screen.getByTestId("convert-target")).toBeDisabled();
  });
});
