import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InboxAlbumRow } from "./InboxAlbumRow";
import type { CheckResult, InboxAlbum } from "./types";

const check = (status: CheckResult["status"], detail: string | null = null): CheckResult => ({ status, detail });

const album = (overrides: Partial<InboxAlbum> = {}): InboxAlbum => ({
  folder_path: "/inbox/Artist - Album",
  folder_name: "Artist - Album",
  artist: "Artist",
  album: "Album",
  year: 2020,
  tracks: [
    {
      file_path: "/inbox/Artist - Album/01.flac",
      file_name: "01.flac",
      title: "One",
      track_number: 1,
      disc_number: 1,
      duration_secs: 100,
      format: "FLAC",
      bitrate_kbps: null,
      sample_rate: 96000,
      bit_depth: 24,
    },
  ],
  checks: { tags: check("pass"), cover: check("pass"), tracklist: check("pass"), duplicate: check("pass") },
  ...overrides,
});

const renderRow = (a: InboxAlbum, props: Partial<Parameters<typeof InboxAlbumRow>[0]> = {}) =>
  render(<InboxAlbumRow album={a} disabled={false} onFileAway={vi.fn()} onConvert={vi.fn()} {...props} />);

describe("InboxAlbumRow", () => {
  it("renders album info and all four check pills", () => {
    renderRow(album());
    expect(screen.getByText("Album")).toBeInTheDocument();
    expect(screen.getByText(/Artist · 1 tracks · 2020/)).toBeInTheDocument();
    for (const label of ["Tags", "Cover", "Tracklist", "Library"]) {
      expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it("shows File Away when all checks pass", () => {
    const onFileAway = vi.fn();
    const a = album();
    renderRow(a, { onFileAway });

    fireEvent.click(screen.getByRole("button", { name: "File Away" }));
    expect(onFileAway).toHaveBeenCalledWith(a);
  });

  it("shows Override & File when a check fails", () => {
    const onFileAway = vi.fn();
    const a = album({
      checks: {
        tags: check("fail", "2 missing title"),
        cover: check("pass"),
        tracklist: check("pass"),
        duplicate: check("pass"),
      },
    });
    renderRow(a, { onFileAway });

    expect(screen.queryByRole("button", { name: "File Away" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Override & File" }));
    expect(onFileAway).toHaveBeenCalledWith(a);
  });

  it("shows Checking while a check is pending", () => {
    const a = album({
      checks: { tags: check("pass"), cover: check("pass"), tracklist: check("pending"), duplicate: check("pass") },
    });
    renderRow(a);

    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "File Away" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Override & File" })).not.toBeInTheDocument();
  });

  it("treats warnings as filable", () => {
    const a = album({
      checks: {
        tags: check("pass"),
        cover: check("warn", "Embedded art only"),
        tracklist: check("pass"),
        duplicate: check("pass"),
      },
    });
    renderRow(a);

    expect(screen.getByRole("button", { name: "File Away" })).toBeInTheDocument();
  });

  it("disables the action while busy", () => {
    renderRow(album(), { disabled: true });
    expect(screen.getByRole("button", { name: "File Away" })).toBeDisabled();
  });

  it("expands to show track files and collapses again", () => {
    renderRow(album());
    expect(screen.queryByText("One")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show files" }));
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("FLAC · 24-bit · 96.0 kHz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide files" }));
    expect(screen.queryByText("One")).not.toBeInTheDocument();
  });

  it("toggles the release comparison from the Tracklist pill", () => {
    renderRow(album({ checks: { ...album().checks, tracklist: check("fail", "1 track here vs 12") } }));
    const pill = screen.getByRole("button", { name: /Tracklist/ });

    fireEvent.click(pill);
    expect(screen.getByTestId("release-comparison")).toBeInTheDocument();

    fireEvent.click(pill);
    expect(screen.queryByTestId("release-comparison")).not.toBeInTheDocument();
  });

  it("leaves the Tracklist pill inert without artist and album tags", () => {
    renderRow(album({ artist: null, album: null }));

    expect(screen.queryByRole("button", { name: /Tracklist/ })).not.toBeInTheDocument();
  });

  it("leaves the Tracklist pill inert while the check is still pending", () => {
    renderRow(
      album({
        checks: { tags: check("pass"), cover: check("pass"), tracklist: check("pending"), duplicate: check("pass") },
      }),
    );

    expect(screen.queryByRole("button", { name: /Tracklist/ })).not.toBeInTheDocument();
  });
});
