import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FileRow } from "./FileRow";
import type { CompareEntry } from "./types";

const entry = (status: CompareEntry["status"] = "source_only"): CompareEntry => ({
  relative_path: "Artist/song.mp3",
  is_dir: false,
  source_size: 5000,
  target_size: null,
  source_modified: null,
  target_modified: null,
  status,
});

describe("FileRow", () => {
  it("renders the last path segment", () => {
    render(<FileRow entry={entry()} depth={0} isSelected={false} onToggleFile={vi.fn()} />);
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
  });

  it("reflects the selected state and toggles", async () => {
    const onToggleFile = vi.fn();
    render(<FileRow entry={entry()} depth={0} isSelected onToggleFile={onToggleFile} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await userEvent.click(checkbox);
    expect(onToggleFile).toHaveBeenCalledWith("Artist/song.mp3");
  });

  it("shows no checkbox for matching files", () => {
    render(<FileRow entry={entry("same")} depth={0} isSelected={false} onToggleFile={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows an MP3 marker for transcoded pairs", () => {
    const transcodedEntry = { ...entry("same"), relative_path: "Artist/song.flac", transcoded: true };
    render(<FileRow entry={transcodedEntry} depth={0} isSelected={false} onToggleFile={vi.fn()} />);
    expect(screen.getByText("song.flac")).toBeInTheDocument();
    expect(screen.getByTitle("Synced as song.mp3")).toHaveTextContent("MP3");
  });

  it("shows no MP3 marker for plain pairs", () => {
    render(<FileRow entry={entry("same")} depth={0} isSelected={false} onToggleFile={vi.fn()} />);
    expect(screen.queryByText("MP3")).not.toBeInTheDocument();
  });
});
