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
  tracks: [],
  checks: { tags: check("pass"), cover: check("pass"), tracklist: check("pass"), duplicate: check("pass") },
  ...overrides,
});

describe("InboxAlbumRow", () => {
  it("renders album info and all four check pills", () => {
    render(<InboxAlbumRow album={album()} disabled={false} onFileAway={vi.fn()} />);
    expect(screen.getByText("Album")).toBeInTheDocument();
    expect(screen.getByText(/Artist · 0 tracks · 2020/)).toBeInTheDocument();
    for (const label of ["Tags", "Cover", "Tracklist", "Library"]) {
      expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it("shows File Away when all checks pass", () => {
    const onFileAway = vi.fn();
    const a = album();
    render(<InboxAlbumRow album={a} disabled={false} onFileAway={onFileAway} />);

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
    render(<InboxAlbumRow album={a} disabled={false} onFileAway={onFileAway} />);

    expect(screen.queryByRole("button", { name: "File Away" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Override & File" }));
    expect(onFileAway).toHaveBeenCalledWith(a);
  });

  it("shows Checking while a check is pending", () => {
    const a = album({
      checks: { tags: check("pass"), cover: check("pass"), tracklist: check("pending"), duplicate: check("pass") },
    });
    render(<InboxAlbumRow album={a} disabled={false} onFileAway={vi.fn()} />);

    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
    render(<InboxAlbumRow album={a} disabled={false} onFileAway={vi.fn()} />);

    expect(screen.getByRole("button", { name: "File Away" })).toBeInTheDocument();
  });

  it("disables the action while filing", () => {
    render(<InboxAlbumRow album={album()} disabled onFileAway={vi.fn()} />);
    expect(screen.getByRole("button", { name: "File Away" })).toBeDisabled();
  });
});
